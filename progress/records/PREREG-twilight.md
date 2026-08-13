# PREREG-twilight — §298 owner decision executed: cool the ≤2° anchors' fill leg toward violet (DESIGN-twilight Option B), sealed A/B

Sealed **before any candidate frame exists**. `shots/twilight1/` does not exist at the time of
writing; no frame of any shot at sun elevation < 15° exists anywhere in the tree except the
night/guard canonicals (el −41/−59, different anchors). Everything numeric in this seal is
**arithmetic on committed code**, evaluated offline through the real `evalAtmosphere` —
disclosed per §13/§141 in §8 below.

Owner decision (§298, 2026-08-12, verbatim constraints): cool the ≤2° sun-elevation anchors'
fill/shadow leg toward violet (the BotW Gerudo-dusk device: violet shadow against warm key
light); the 22° golden anchor is UNTOUCHABLE (daylight must be provably unchanged); ships only
through a sealed A/B with hue-DISPERSION bars over redflood's WALL ROIs, daylight-protection
diffs on ≥3 golden-anchor shots, and a binding LOOK gate.

## 1. Pre-seal finding: where the anchors actually are, and what tod 0.80 actually is

Two corrections to the working record, both established by reading and evaluating HEAD
(104470d) before sealing — neither moves a constant:

1. **The elevation-keyed anchor table lives in `src/render/Atmosphere.js` (`ANCHORS`,
   els −16/−5/2/22/76), not in Lighting.js.** Lighting.js only consumes it via
   `evalAtmosphere`. The candidate therefore targets Atmosphere.js; Lighting.js (which
   carries torch's shipped-gated `localToon` block) is not touched at all.

2. **The registered defect framings are not lit by the twilight anchors.** `sly-perch` /
   `sly-arm` stage at `tod 0.80`, and on the SUN_ELEVATION track that is **el 20.97°** —
   inside the [2°, 22°] span at eased weight k = 0.9922 toward GOLDEN. The el ≤ 2° anchors
   carry **0.78%** of the blend there. RESULT-redflood §1's parenthetical quoted the el 2/−5
   anchor constants (#ffb072→#d08050, hemiGround #d08a48, fog #db9a68) as the tod-0.80
   environment; evaluated, the live tod-0.80 environment is key #ffd9a0 @ 3.29, hemiSky
   #6fa8d8, hemiGround #e8a852, fog #e8b878 — i.e. ≈ the golden anchor. The structural claim
   of §293 stands (every source lighting those walls IS warm except the sky fill), but the
   attribution to the sub-knee anchor values does not: **tod 0.80 is late golden hour, not
   twilight, on this track** (the knee — el 0 — is at tod 0.895).

   Anchor-weight table for the ≤2° anchors, W(el) = 1 − k, k = s²(3−2s), s = (el−2)/20:

       el 22+  W = 0 exactly (span [22,76] blends two untouched anchors)
       el 20.97 (tod 0.80)  W = 0.0078      el 15 (tod 0.83, dunes)  W = 0.282
       el  8.00 (tod 0.86)  W = 0.784       el  2.01 (tod 0.8833)    W ≈ 1.000

   Verified end-to-end on the candidate module (§3): at tod 0.80 the lever moves the resolved
   hemiGround by ONE hex step (#e8a852→#e8a854) and hemiSky by zero — **Option B cannot
   visibly change the r10 defect framings at their sealed staging.** That is a property of the
   owner's own constraint set (22° untouchable + elevation-keyed table), discovered before
   sealing and registered here as a HARD BAR (B5) rather than papered over: this run measures
   the decided mechanism where it exists (twilight elevations, same cameras, same ROIs), and
   pins on pixels that the registered stagings are unchanged. If the owner wants the violet
   dusk IN those framings, that is DESIGN-twilight's deferred Option-A staging question
   (tod → ≈0.883+), re-opened by this seal's B5 numbers — routed, not decided here.

## 2. The candidate (the values are this lane's; the constraints are the owner's)

Four data literals in `ANCHORS`, fill/shadow leg only, per-leg display luma matched to ±2% so
twilight brightness does not move — only chroma:

    anchor el  2  hemiSky    0x5a86bd (h 213°, luma 128.6) → 0x8578d2 (h 249°, luma 129.3)
    anchor el  2  hemiGround 0xd08a48 (h  29°, luma 148.1) → 0xa988c6 (h 272°, luma 147.5)
    anchor el −5  hemiSky    0x3f5f97 (h 218°, luma  92.2) → 0x5c54a8 (h 246°, luma  91.8)
    anchor el −5  hemiGround 0x8a5a52 (h  17°, luma  99.6) → 0x6d5a91 (h 261°, luma  98.0)

- The **sun/key leg stays warm** (sunColor/sunDisc/sunGlow untouched), the sky-dome legs
  (zenith/horizon/haze/violet/groundHaze/fog*) untouched — the dusk sky remains a warm sunset,
  which is the contrast the device needs — and every intensity scalar untouched.
- Derived legs move with the source by the shipped arithmetic, as intended: ambientColor
  (30% hemiSky lerp) picks up violet; bounceColor follows hemiSky only by nightAmount·0.7.
- The el −16 night anchor is **deliberately not touched**: its fill legs are already cool
  (#2c4f8e/#3b3552), there is no warm key at night for the device to oppose, and `night`/
  `guard` are outside this defect. The cooled −5 values sit between the cooled 2° values and
  the night values, so the track's fill is now monotone cool through sunset into night where
  HEAD had a warm pocket at −5.
- **The 22° golden anchor is byte-identical**, and every el ≥ 22 frame is arithmetically
  invariant (W = 0); B4 verifies that on pixels anyway.
- Known, disclosed spillover: **dunes (tod 0.83, el 15) receives W = 0.282** of the fill delta
  (resolved hemiSky #6a9fd1→#769cd6, hemiGround #e2a04f→#d9a081). Not a protection failure:
  el 15 is below the golden key and the critic's own dunes note asks for violet slip-face
  shadow (DESIGN-twilight). It is captured, diffed, and LOOK-cropped (B6), report + taste.
- Sly's own read is defended by shipped mechanism, not hope: subjShadowHold 1.0 (§289) holds
  the costume's hue in shade; B3 verifies on pixels.

**Candidate file**: `progress/records/twilight/Atmosphere.cand.js` — HEAD's Atmosphere.js
plus one strictly-additive, render-inert block (`TWILIGHT_COOL` table + `setTwilightCool()` +
`window.__setTwilightCool` hook) appended after ANCHORS. **Anchor literals are NOT flipped in
the cand file**: its resting state evaluates bit-identically to HEAD (verified offline on
every arm tod before sealing), so a stranded install cannot poison another lane's boot —
§298.3's hazard closed by construction. Arms drive the lever; the anchors are the SOURCE both
consumers (Lighting._applyAtmosphere, Sky._refresh) re-derive from, so a lever poke is
exactly the shipped-file arithmetic — poke the table, not the uniform (the §293 hazeDensity
lesson, applied). `progress/records/twilight/cand.patch` records the diff.

**What ships on PASS** (separate commit, after the RESULT): exactly the four `cand` hex
literals into `src/render/Atmosphere.js`'s anchor table (+ an authorship comment), lever
block NOT shipped. Suite must stay green (`node --test "tests/*.test.mjs"`); the only test
that reads hemi legs (tone2.test.mjs) reads the −16 night anchor, untouched here.

## 3. Instrument

Runner `progress/records/twilight/twilight1.mjs` (launched detached via tools/launch.sh —
§298.3). One boot, one lock window. §186: candidate installed at onLocked, restored at
onReleasing, sha-verified both ways; **onLocked REFUSES (aborts the run, installs nothing) if
`git status --short -- src/` is non-empty at lock grant** — the torch-run-2 failure class,
made a registered VOID instead of a poisoned run. Tree stamped **per capture**
({head, srcTree, dirty} via tools/treestate.mjs — §296: one locked boot is NOT one tree).

Staging matrix — `setShot(name, {dt:0})` once per shot; within a shot, twilight re-staging is
`engine.debug.timeOfDay = v` **without** emitting 'timeOfDay' (Lighting and Sky self-detect
on their update path; Particles' mote-reseed listener and Guard's snap listener never fire —
motes stay the shot-staging field, identical across arms; Guard._light is dt-scaled and dt is
0 everywhere). Every arm: lever call → `L._applyAtmosphere()` → `sky._dirty = true` → 3 ×
`E.renderFrame(0)` → probe → capture. No retries, no world-clock advances, no `step()` — the
whole run is 36 single renders (~30–45 min of lock, stated per §298.3's wall-clock rule).

    sly-perch   @tod 0.80 (el 20.97): base → cand → back      [B5, V]
                @tod 0.8833 (el 2.01): base → cand → back     [B1,B2,B3, V]
                @tod 0.86  (el 8.00): base → cand → back      [report-only]
                @tod 0.9026 (el −1.51, keyIsMoon): base → cand → back   [report-only, −5 leg]
    sly-arm     @tod 0.80: base → cand → back                 [B5, V]
                @tod 0.8833: base → cand → back               [B1,B2,B3, V]
                @tod 0.86: base → cand → back                 [report-only]
    dunes       @tod 0.83 (staged tod): base → cand → back    [disclosed spillover, B6 crop]
    hero, temple, courtyard, interior (els 22/33/26/76): base → cand → back   [B4, V]

Arms are uniform: base = lever(0), cand = lever(1), back = lever(0), all explicit, all
readback-checked. Per-arm probe records: tod, sunElevation, keyIsMoon, key hex/intensity,
the four anchor hex readbacks, resolved state hexes (atmosphere.hemiSky/hemiGround/
ambientColor), the scene-light copies (_hemi.color/groundColor), the payload copies
(_keyPayload.ambient.sky/ground), engine time, and the subject bbox (8-corner projection,
c10postfx2's probe) on character shots.

Expected readbacks (offline-evaluated through the cand module, exact hex strings the scorer
asserts):

    lever(0) anchors: a5 3f5f97/8a5a52, a2 5a86bd/d08a48
    lever(1) anchors: a5 5c54a8/6d5a91, a2 8578d2/a988c6
    state (hemiSky/hemiGround) per (tod, lever):
      0.80    base 6fa8d8/e8a852   cand 6fa8d8/e8a854
      0.8833  base 5a86bd/d08a48   cand 8578d2/a988c6      el 2.010, key ffb072@1.450
      0.86    base 5f8ec3/d5914a   cand 8184d3/b990b5      el 8.000
      0.9026  base 4e74ab/b1754d   cand 7368be/8f74ae      el −1.512, keyIsMoon true
      0.83    base 6a9fd1/e2a04f   cand 769cd6/d9a081
      0.79 / 0.72 / 0.76 / 0.5: base == cand (6fa8d8/e8a852, 71a9d9/e7a854, 6fa8d8/e8a852,
      7fb4e0/dfa860) — the golden invariance, asserted at the state level AND on pixels (B4).

## 4. Registered ROIs and statistics

WALL ROIs carried **verbatim** from PREREG-redflood (same cameras, same poses; geometry is
static so the plane occupies the same pixels; only the light changes): sly-perch WALL =
[900, 60, 1260, 330], sly-arm WALL = [900, 40, 1260, 300] (x0, y0, x1, y1). Derivation
disclosure: those ROIs were drawn on r10 tod-0.80 frames (shadowhold's rule, disclosed in
that seal); no frame at the twilight stagings has been seen by anyone — the carry-over is a
registered choice, not a calibration.

All hue statistics are **circular and chroma-weighted**: per pixel, HSV h/S/V from sRGB
bytes, weight w = S·V. Over a population P:
R̄ = Σ w·(cos h, sin h) / Σ w; mean hue h̄ = atan2(R̄); **dispersion D = √(−2 ln |R̄|)** in
degrees (weighted circular std). Degeneracy guard: Σw < 0.02·|P| ⇒ statistic VOID-degenerate.

- **DISP(shot, frame)** = D over all WALL-ROI pixels (the ROI is the registered selection —
  no sub-selection, §282).
- **SEP(shot, frame)**: populations fixed **on the base frame of the same staging block** —
  LIT = pixel indices with L_base ≥ p65(L_base over ROI), SHADE = L_base ≤ p35; the same
  indices are then measured in base and cand (no re-selection between arms, §282). SEP =
  circular distance between h̄(LIT) and h̄(SHADE). Degeneracy guard: p65 − p35 < 8 L ⇒ SEP
  undefined for that shot (VOID-degenerate, disclosed in §6).
- **COSTUME(shot)**: population fixed on base = pixels inside the probed subject bbox
  (clamped to frame) with S ≥ 0.10 and V ∈ [0.10, 0.97]; |P| ≥ 800 else VOID-subject-small.
  Measured in base and cand on the same indices: weighted mean hue, mean S, mean L.
- Luma L = Rec.709 on sRGB bytes throughout (redflood's convention).

## 5. Bars (binding unless marked report-only; evaluated in this order by the sealed scorer)

Validity first — any failure below VOIDs the block it covers; a VOID on a binding block ⇒
run outcome VOID (fail-closed):

- **V0** onLocked dirty-check honoured (log shows clean src/ at grant, or the run aborted).
- **V1** tree stamps: every capture's {head, srcTree} identical, and head equals the
  lock-grant stamp's head; V0's clean-at-grant plus the single logged install is what
  accounts for the tree's delta from HEAD (the only dirty file is the installed candidate).
- **V2** readbacks: per arm, anchor hexes == lever expectation; resolved state hexes == the
  §3 table; propagation equalities state==light==payload (hemiSky and hemiGround); el within
  ±0.05 of expectation (±0.1 at 0.9026); keyIsMoon false on every arm except tod 0.9026
  where it must be true; subject bbox present (not BEHIND/null) on character-shot arms.
- **V3** per-block restore: back == base at **0 px, |d| ≥ 1, any channel** for every staging
  block. (Same-boot, dt 0, no clock advances; c10postfx2 held this on 7/8 blocks and the 8th
  was a step()-retry casualty — there are no steps here.)

Effect and protection:

- **B1 DISPERSION** (the owner-named statistic), at tod 0.8833, each of sly-perch AND
  sly-arm: DISP(cand) ≥ DISP(base) + 8° **and** DISP(cand) ≥ 1.5 × DISP(base).
- **B2 LIT/SHADE SEPARATION** (the owner's sentence as arithmetic), at tod 0.8833: on every
  non-degenerate shot, ΔSEP = SEP(cand) − SEP(base) reported; PASS iff ≥ 1 of the 2 shots
  clears **ΔSEP ≥ +15°** and no non-degenerate shot goes below −5° (no-harm). Both shots
  degenerate ⇒ B2 VOID ⇒ NO-SHIP (the mechanism claim is unverified at the evidence surface;
  mis-aim recorded, re-seal is a new file).
- **B3 COSTUME LEGIBILITY**, at tod 0.8833, each character shot: on the base-fixed costume
  population — (a) weighted mean hue in cand ∈ [190°, 285°] (the blue→violet family; his
  blue/grey must not flip warm or crush to grey), (b) mean S in cand ≥ 0.70 × base, (c)
  |mean L cand − base| ≤ 12 (the fill is luma-matched by design; this catches a miss).
- **B4 GOLDEN PROTECTION** (≥3 required; 4 taken): hero, temple, courtyard, interior —
  diff(base, cand) == **0 px at |d| ≥ 1**, any channel, full frame. The anchor table is
  elevation-keyed so this holds by construction (W = 0, float32-exact); the bar verifies it
  on pixels. **Floor: zero, no allowance** — any nonzero count here is a mechanism leak and
  the outcome is NO-SHIP regardless of everything else.
- **B5 SCOPE AT THE REGISTERED STAGING**: sly-perch and sly-arm at tod 0.80:
  diff(base, cand) == **0 px at |d| ≥ 2** (binding; the resolved-state delta is ≤ 1 hex step
  on one leg, so any ≥2 step is a leak). The |d| ≥ 1 count and ROI mean|Δ| are REPORT-ONLY
  (sub-LSB shifts may flip dither-adjacent pixels by 1; a count is information, not a bar —
  aimed per §296.3's lesson about unachievable duplicate bars).
- **B6 LOOK (binding)**: the scorer writes registered crops — WALL ROI at 2× and subject
  bbox at 2×, base|cand pairs, both character shots at tod 0.8833; dunes full-frame pair +
  ×8 diffmap; tod-0.9026 perch pair (report). The RESULT must state what changed, that the
  key stayed warm while the shade went violet, and that nothing else moved. No numeric bar
  substitutes for the looking.

Report-only rows (no bars, printed for the record): tod 0.86 blocks (el 8 — the blend path),
tod 0.9026 block (el −1.5 — the −5 leg under moon key), DISP/SEP at those stagings, B5's
|d|≥1 census, dunes' diff census.

**Outcome tri-state** (fail-closed): SHIP-PENDING-LOOK iff V0–V3 pass on all binding blocks
and B1–B5 all pass; then the RESULT applies B6 and decides SHIP / NO-SHIP. Any binding VOID ⇒
VOID (no evidence claim, re-run or re-seal). Any bar FAIL ⇒ NO-SHIP, mis-aim (if any)
recorded, constants untouched. **§141.1: no threshold moves after this file is committed; a
mis-aimed bar is a NO-SHIP with the mis-aim recorded; a re-seal is a new file.**

## 6. Registered forecast (held loosely; ledger entering 4/15 per RESULT-redflood)

B4, B5, V-set: pass by construction (the arithmetic above). B1: pass on both shots — base
DISP forecast 6–14° (warm-converged fill), cand ≥ 22° (fill legs split 249°/272° against a
29°-hue key at I 1.45 vs hemi 0.66). B2: at el 2 with sun az ≈ 197° the framings hold both
lit faces and shade; forecast ≥ 1 shot non-degenerate with ΔSEP +20–60°. Named risk, honest:
the WALL plane may be single-population at el 2 (all-shade) — then B1 rises only via
fill-mix variation and may miss its ×1.5, and B2 leans on its degeneracy guard; that is a
NO-SHIP under these bars and the re-seal aims at a mixed-population ROI with the diagnostic
histograms this run archives. B3: pass (subjShadowHold; luma-matched fill). B6: violet shade
against warm key visible in the crops. Overall: **SHIP**, with the §1 disclosure standing —
the registered tod-0.80 framings provably unchanged (that half of the r10 complaint needs
the deferred staging decision, and B5 hands the owner its exact size).

## 7. VOID conditions, enumerated

- src/ dirty at lock grant (V0 abort) — run VOID before any frame.
- Missing frame/probe/stamp for a binding block; run JSON absent or truncated.
- Tree split: any stamp differing in head or srcTree (V1) — attribution VOID across the split.
- Readback mismatch (V2): a poke that did not take or did not propagate is the §293 haze
  trap; the arm is VOID, and any binding block containing it is VOID.
- back ≠ base (V3) on a binding block — drift/contamination; block VOID.
- Subject absent (bbox BEHIND/null) or costume population < 800 px on a B3 shot.
- Both B2 populations degenerate (B2 VOID as specified).
- el/keyIsMoon staging assertions off (V2) — the staging itself is then wrong.
- Renderer not the SwiftShader/ANGLE string family every sealed run has recorded, or page
  console errors naming Atmosphere/Lighting/Sky module failures.

## 8. Calibrate-then-accept disclosures (§13 / §141)

- Every threshold in B1–B3 (margins +8°, ×1.5, +15°, −5°, hue window [190, 285], S ratio
  0.70, |ΔL| ≤ 12, population floors 800 px / Σw ≥ 0.02·|P|, luma split p65/p35, 8 L gap) is
  an **arithmetic forecast, calibrated on no frame** — no twilight-staged frame of these
  framings exists to calibrate on, and none was captured before this seal. They apply to a
  NEW boot by construction (the only boot).
- The WALL ROIs and the B5/B4 strict-zero floors are carried from PREREG-redflood /
  c10postfx2's measured same-boot behaviour respectively — inherited **rules**, disclosed;
  the floors are not derived from any frame this seal produced.
- The §3 expected-readback table was computed by evaluating the candidate module offline
  (node, same code, same three.js) — code-derived, not frame-derived; it binds a NEW boot.
- ROI luma/hue histograms (32-bin) for every WALL-ROI arm are archived by the sealed scorer
  in verdict.json so a re-seal can aim without spending a boot.

## 9. SCORING RECIPE (exact commands — for the coordinator if this lane dies)

The run is fully detached (survives this session). Everything below is idempotent.

1. **Is it done?** `tail -5 /home/user/Demo/progress/records/logs/twilight-run1.log` — the
   last line of a completed run is `twilight1 DONE -> /home/user/Demo/shots/twilight1/run.json`.
   If the process died mid-lock: check `git status --short -- src/render/Atmosphere.js`; if
   modified, verify `sha256sum src/render/Atmosphere.js` equals the cand sha printed in the
   log's `installed candidate` line, then `git checkout -- src/render/Atmosphere.js`
   (§298.3's recovery). Never edit src/ while another run holds the lock.
2. **Score:** `node /home/user/Demo/progress/records/twilight/twilight-score.mjs`
   → prints every bar in §5 order, writes `/home/user/Demo/shots/twilight1/verdict.json`
   and crops under `/home/user/Demo/shots/twilight1/crops/`.
3. **Look (B6 is binding):** open the crops named in the scorer output
   (`perch-TWI1-wall-{base,cand}-2x.png`, `arm-TWI1-wall-{base,cand}-2x.png`,
   `perch-TWI1-subj-{base,cand}-2x.png`, `arm-TWI1-subj-{base,cand}-2x.png`,
   `dunes-{base,cand}.png` + `dunes-diffmap-x8.png`, `perch-TWI3-{base,cand}.png`).
4. **Write `progress/records/RESULT-twilight.md`:** verdict per §5's tri-state; include the
   B5 numbers as the owner-facing size of "Option B does not reach tod 0.80"; forecast
   scored against §6; ledger updated.
5. **On SHIP only:** apply the four §2 hex literals to `src/render/Atmosphere.js` (el −5:
   hemiSky 0x3f5f97→0x5c54a8, hemiGround 0x8a5a52→0x6d5a91; el 2: hemiSky 0x5a86bd→0x8578d2,
   hemiGround 0xd08a48→0xa988c6), run `node --test "tests/*.test.mjs"`, commit records +
   the one src file with explicit paths, push `claude/sly-cooper-ancient-egypt-0koo0u`.
   **No src/ commit while any capture run is live (§296).** On NO-SHIP/VOID: record, touch
   nothing.
