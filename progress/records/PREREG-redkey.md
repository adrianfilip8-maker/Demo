# PREREG-redkey — the red-key saturation clamp: albedo survives the warm key, the flood stays warm

**Lane:** LIGHTING/grade (critic r11 queue item 1a — RESULT-critic11.md family 1, "the
exposure/grade catastrophe"; parents in evidence: RESULT-redflood.md §293, RESULT-twilight.md
§300, KNOWN_ISSUES §277 finding 1). **Date sealed:** 2026-08-13.
**Status: REGISTERED before any capture. `progress/records/redkey/` does not exist at the
time of writing and no frame of any arm has been rendered.** Runner (`redkey.mjs`) and scorer
(`redkey-score.mjs`) are committed with this file, before the capture, together with the
INERT mechanism (`TUNE.keySatMax: 1.0`, branch-untaken) and its pin test
(`tests/redkey.test.mjs`).

## 0. What this seal is, and what it is licensed NOT to do

Critic r11's #1 cost family opens with "the red-salmon flood erasing albedo (perch/arm/
combat/courtyard)". Two prior seals bound what a fix may be:

- §293 (redflood): the flood is the LIGHT ENVIRONMENT — at tod 0.80 every source is warm by
  authored design and the grade knobs explain ~1/3 at most. Cooling the environment is the
  standing **Option-A staging question** (owner's), NOT this seal's license.
- §300 (twilight): recoloring an ambient (hemisphere legs) tints lit and shade alike and
  REDUCED dispersion. The lever must be scoped to a term that discriminates.

This seal's lever is scoped to the KEY as consumed by the toon set: a **luma-matched chroma
ceiling on `uKeyColor` at arrival in `setKeyLight`** (linear sat = (max−min)/max, warm keys
only). The albedo keeps carrying hue; the light stops over-tilting channel ratios. The sky
dome, fog, hemisphere fill, shadow light and every additive term are untouched — the frame's
warm flood REMAINS (protection-barred below); what changes is that distinct lit albedos stop
converging onto one salmon family.

Mechanism evidence, measured on the r11 frames (same src tree as HEAD, `6253ec120e84d41a`;
`scratchpad/redkeyrois.mjs` re-runnable from this file's ROI table): the rope coil prop reads
chroma-weighted circular hue dispersion **92.2°** where shade-lit (sly-profile, the critic's
praised read) and **8.6°** where key-lit under the flood (sly-arm) — same object, same
albedo. The display model (grade+AgX chain validated 0.35 L worst against PostFX.js's live
grey row; `scratchpad/redkeymodel.mjs`) puts the lit two-tone separation back ×1.5–2.4 at
satMax 0.50–0.40 while lit sandstone moves ≤ 2 display L and its R−B not at all — warm
albedo × key barely sees the clamp, which is exactly the §300 lesson applied: this term
discriminates BY ALBEDO, which is what "albedo survives" means.

## 1. Ownership and discipline

This lane's src surface for this seal is ONE file (`src/render/ToonMaterial.js`) plus its pin
test, committed INERT (bit-identical at the default; the pin test proves the spelling) before
any frame. **The capture installs nothing**: HEAD is the tree, and the arms are
`debug.keySatMax` pokes — the c10postfx2/twilight lever pattern, held at 0 px twelve-for-
twelve same-day (§302) and 42-for-42 in torchlight3 (§303). No src commit while any capture
runs or queues (§296); bars sealed and pushed before any candidate frame; no post-hoc
threshold moves (§141.1); fail-closed tri-state via `tools/gate.mjs`; `ringPainter`
untouched; runner launched detached via `tools/launch.sh` (§298.3).

## 2. The candidate

One TUNE key, one arrival clamp, one gate chain — `src/render/ToonMaterial.js` only:

- `TUNE.keySatMax` (default **1.0**): gate spelled `satMax < 1` — at 1.0 the block is
  UNTAKEN and no arithmetic touches `uKeyColor` (the localToon/uSpecNormPow standard).
- Warm gate `c.r > c.b` — the moon key (linear (0.342, 0.552, 1.0)) never enters: `night`
  and `guard` are arithmetically unchanged at ANY satMax.
- Binding gate `D > satMax·max` — the midday interior key (linear sat 0.284) never enters
  at the candidate value: `interior` is arithmetically unchanged.
- The clamp: exact solve `t = (D − s·mx)/(D − s·mx + s·L)`, blend toward the key's own luma
  grey — luminance preserved in reals, so `_refreshShadowColor`'s `keyLum` (and the shadow
  floor) does not move.
- `debug.keySatMax` overrides live per publish (null = TUNE); recomputed from the incoming
  colour every frame, so poke/restore are exact by construction (pinned by the test).

**Candidate value under test: 0.45.** Dose arm (`ko`): 0.35, `sly-arm` only. Registered
fallback: 1.0 (mechanism stays, clamp off).

Key facts the gates rest on (computed from the live `evalAtmosphere`, recorded here):
thirteen shots carry a warm key at linear sat 0.609–0.700 (el 15–33; the six tod-0.80
framings sit at 0.650); `interior` 0.284 warm; `night`/`guard` 0.658 cool (moon). So 0.45
binds on exactly the thirteen daylight shots and is untaken on the other three.

## 3. Tree — HEAD, no install

- HEAD at seal time: `c70f1ce` (src hash `6253ec120e84d41a`, unchanged since the torchlight
  ship 369f6d5 — the r11 frames' own tree). The seal commit lands the inert mechanism on top;
  the runner records the NEW HEAD sha and its `git archive HEAD` src hash at launch and
  requires every manifest row's `treeState().src` to equal it (V4).
- PF6 launch pins: working src/ clean; `HEAD:src/render/ToonMaterial.js` carries
  `keySatMax: 1.0` (the inert default — a flipped default means a ship write landed and this
  seal is stale); roster = the 16 canonicals.

## 4. ROIs and statistics (registered; derived by looking at the r11 frames, shadowhold's rule)

Display bytes; Rec.709 L; HSV S; **disp** = chroma-weighted circular hue dispersion
(weights = HSV chroma d = max−min; disp = sqrt(−2·ln R̄) in degrees — the §293/§298 lens,
mean saturation is the proven-wrong one); circDist = circular distance in degrees.

| shot | ROI | rect | r11 base (for calibration only — bars use the off arm) |
|---|---|---|---|
| sly-perch | SHIRT | [575, 235, 670, 345] | S 0.349, hue 268.1, disp 73.6 |
| sly-perch | WALL | [900, 60, 1260, 330] | (redflood carry) meanRB 103.5 |
| sly-arm | COIL | [180, 465, 450, 625] | disp 8.6 — the two-tone erased |
| combat | GROUND | [640, 560, 1120, 700] | disp 23.6 |
| hero/kaykit/temple/courtyard/dunes | FULL | [0, 0, 1280, 720] | protections |

Reference for the COIL statistic's meaning: the same prop shade-side (sly-profile
[830, 430, 1120, 600]) measures disp 92.2 — that is what "legible" looks like on this
renderer. No bar targets 92.2; the bars below ask for the registered re-emergence step.

## 5. Arms and the boot (runner `redkey.mjs`; frames → `progress/records/redkey/`)

Carried mechanics from PREREG-torchlight3 §6 verbatim where applicable: quality high,
1280×720, `setShot(name, {dt:0})` → `step(3,0)` → `renderFrame(0)` staging (§251), roster
order, per-arm readbacks, PF7 fresh out-dir (exists non-empty ⇒ abort, archive, relaunch),
no retries, no manifest resume. **ONE boot, HEAD tree, no install** — `onLocked` verifies
src/ is clean and records `treeState()`; there is nothing to restore (`onReleasing` verifies
the tree is STILL clean — a dirty tree at release is another lane's residue, reported loud).

`debug.keySatMax = 1.0` is set before the first staging (uniform staging disclosure,
torchlight3's) and cleared to `null` after the last shot.

Per canonical shot (all 16, roster order), while the shot stays staged:
1. stage once — NOT captured;
2. poke `debug.keySatMax = 1.0` → settle `step(2,0)` + `renderFrame(0)` → **`<shot>.off.png`**;
3. poke `0.45` → same settle → **`<shot>.on.png`**;
4. `sly-arm` only: poke `0.35` → same settle → **`sly-arm.ko.png`**;
5. poke `1.0` → same settle → **`<shot>.back.png`**.

Readback per arm: `debug.keySatMax` echo, `uKeyColor` {r,g,b} (f64), its recomputed linear
sat, `uKeyIntensity`, `TUNE.keySatMax`. Captured arms: 16×3 + 1 = **49 frames**.

**Lock-hold price (§298.3): ~80–100 min** — same shape as torchlight3 (one boot 6–9 min,
16 stagings ≈ 55 min, 49 poke arms ≈ 14–40 min).

## 6. Registered bars (scored by `redkey-score.mjs` through `tools/gate.mjs`; VOID is not PASS; ship = every row PASS **and** the LOOK gate)

| id | quantity | band |
|---|---|---|
| **BG1** | off-arm defect gates: COIL disp ≤ 14 ∧ SHIRT S ≤ 0.42 ∧ GROUND disp ≤ 30 | in → else **VOID** (staging/tree not the diagnosed one) |
| **R1–R16** (`R_<shot>`) | diff(`off`, `back`) decoded differing px | **[0,0]** each — nonzero VOIDs that shot's block (PF4) |
| **B_night, B_guard, B_interior** | diff(`off`, `on`) decoded differing px | **[0,0]** each — the untaken-branch protection, same-boot |
| **E1** | COIL disp: `on` vs `off` | ≥ ×1.30 ∧ ≥ +2.5° |
| **E2** | GROUND disp: `on` vs `off` | ≥ ×1.12 ∧ ≥ +2.0° |
| **E3** | SHIRT: S(`on`) − S(`off`) ≥ **+0.015** ∧ circDist(hue(`on`), 220) ≤ circDist(hue(`off`), 220) − **3°** | both |
| **KO1** | COIL disp(`ko`) vs disp(`on`) | ≥ **+2°** (dose monotone) |
| **P_hero, P_kaykit, P_temple, P_courtyard** | FULL: \|ΔmeanL\| ∧ ΔmeanRB (`on` − `off`) | ≤ **4** ∧ ≥ **−12** |
| **P_dunes** | FULL: \|ΔmeanL\| ∧ ΔmeanRB | ≤ **5** ∧ ≥ **−14** (hardest-bound warm key, 0.700) |
| **PW** | perch WALL meanRB(`on`) | ≥ **60** ∧ ≥ meanRB(`off`) − **25** — the flood STAYS warm (this seal does not cool the environment) |
| **VK** | on-arm readbacks: the 13 warm shots \|sat − 0.45\| ≤ 1e−6; night/guard `uKeyColor` r < b ∧ triple == off triple; interior sat < 0.45 ∧ triple == off triple | else **VOID** |
| **V3** | every off/back arm echoes keySatMax 1 ∧ uKeyColor triple(`off`) == triple(`back`) exactly | else **VOID** |
| **V4** | 49 rows, ONE src hash == the launch-derived HEAD archive hash | else **VOID** |
| **LOOK** | binding looking at registered crops (§9) | recorded in the RESULT; a look failure is **NO-SHIP** regardless of bars |

Fail-closed gating: `B_*`, `E*`, `P_*`, `PW` are VOID unless their shot's `R_<shot>` PASSED;
KO1 is VOID unless `R_sly-arm` PASSED; E1/KO1 VOID unless BG1 PASSED. Model-derived margins,
recorded: E1 asks ×1.30 where the model's pairwise analogue gives ×1.84 at 0.45; P asks ≤ 4 L
where the model's worst lit-sand delta is 1.3 L (the FULL mean dilutes further); PW asks
≥ 60 where the model moves lit-stone R−B by ~0 (r11 base 103.5).

## 7. Falsifiers — revert, do not defend

- **PF1** — E1/E2/E3/KO1/P_*/PW out of band on a valid capture ⇒ **no ship**:
  `TUNE.keySatMax` stays 1.0, finding recorded. No retune toward a band; a different satMax
  is a different prereg.
- **PF2** — any B-bar ≠ 0 (its R PASSED) ⇒ **no ship** regardless of the daylight bars: the
  untaken-branch arithmetic (warm gate / binding gate) failed on a shot it was registered to
  exempt — that is a mechanism defect, not a tuning question.
- **PF3** — BG1/VK/V3/V4 out ⇒ capture **VOID**, diagnose from readbacks, archive, re-run.
- **PF4** — any R ≠ 0 ⇒ that shot's block VOID (within-boot sag would be a NEW finding —
  name it from the ordinal/timestamp columns before any re-run).
- **PF5** — runner killed mid-boot ⇒ nothing installed, nothing to restore; archive the
  out-dir, relaunch.
- **PF6** — launch pins fail (dirty src, flipped default, roster drift) ⇒ abort unscored.
- **PF7** — out-dir exists non-empty ⇒ abort; archive as `redkey-void-runN`; relaunch.

## 8. §17 look-change declaration

On the thirteen warm-key shots, lit NEUTRAL and COOL albedos (the costume's blue, the coil's
blue-grey, pale plaster/limestone props) stop reading as one salmon family and recover their
authored hue at unchanged brightness; lit WARM stone keeps its read (model: −1.1 L, +1.5°
hue on sandstone); the sky, fog, shadows and night/interior frames are bit-identical or
protection-barred. The flood at tod 0.80 REMAINS a warm flood — this seal claims legibility
inside it, not escape from it.

## 9. LOOK gate crops (binding)

perch [560, 220, 900, 460] (shirt/tail/podium), arm [160, 440, 480, 645] (coil) and
[380, 150, 780, 480] (brazier/tail), combat [600, 380, 1150, 710] (subject+ground),
hero FULL, kaykit FULL (the praised raking sun must survive), temple [300, 100, 900, 500].
Verdict prose goes in RESULT-redkey.md; "on-arm reads worse where an E-bar reads better"
is a look failure.

## 10. Registered forecast (ledger entering 5/18)

**SHIP at 0.45.** Grounds: the effect replicates a mechanism already measured in-frame
(profile's shade-side coil disp 92.2 vs arm's lit 8.6 — the albedo IS legible under this
renderer's shading when the light lets it through); the model (validated 0.35 L worst) puts
every E-band at ≥ ×1.4 margin and every P-band at ≥ ×3; the poke lever class is 0-px-proven
on this exact boot pattern. Honest uncertainties, named: (a) **E3 is the riskiest bar** —
the shirt ROI mixes rim/ink edge pixels the model omits; if E3 alone fails while E1/E2 pass,
that is a verdict (PF1), recorded as "the clamp is not the shirt's mechanism" and the shirt
routes to §277's grade half. (b) P bounds could exceed if spec/sss couple the key harder
than modeled (×3 headroom says no). (c) A B-bar failure would be a gate-arithmetic surprise
(PF2) — nothing in two prior poke seals suggests it. If the capture VOIDs, the candidate
neither ships nor dies — it re-runs.

## 11. SCORING RECIPE (for the coordinator; exact commands, every branch)

The runner is DETACHED (`tools/launch.sh`; §298.3). Do not wait on it interactively.

1. **Is it done?** `tail -5 /home/user/Demo/progress/records/logs/redkey-run1.log` — a
   completed run ends `DONE. Score with: node progress/records/redkey-score.mjs`.
   `ABORT`/`VOID` lines mean PF5/PF6/PF7 fired; the log says which and what to do.
   Liveness: `pgrep -f 'redke[y].mjs'` or check `/tmp/sands-of-ra/redkey1.pid` against
   `/proc`.
2. **If the runner died mid-boot** (PF5): nothing was installed — verify `git status`
   shows src/ clean (a dirty tree is ANOTHER lane's residue: do not touch it, report it),
   archive the out-dir (`mv progress/records/redkey progress/records/redkey-void-runN`),
   relaunch: `bash tools/launch.sh progress/records/redkey.mjs
   /home/user/Demo/progress/records/logs/redkey-runN.log /tmp/sands-of-ra/redkey1.pid`.
3. **Score:** `cd /home/user/Demo && node progress/records/redkey-score.mjs` (exit 0 =
   every row PASS). It prints the tri-state table and the verdict line.
4. **LOOK gate (binding, before any ship write):** open the off and on frames in
   `progress/records/redkey/` directly and compare at the §9 crop rectangles; record the
   verdict prose in RESULT-redkey.md.
5. **Outcome branches** (write RESULT-redkey.md + a KNOWN_ISSUES § in every branch):
   - **PASS + LOOK pass (ship).** §296 first: confirm no capture holds or queues on the
     FIFO (`/tmp/sands-of-ra/capture.lock` absent AND `/tmp/sands-of-ra/queue/` empty)
     immediately before touching src. Then in ONE commit citing RESULT-redkey:
     1. `src/render/ToonMaterial.js`: `TUNE.keySatMax` `1.0` → `0.45`; in the TUNE comment
        replace "Ships at a value below 1.0 only on PREREG-redkey's PASS; 1.0 is the
        registered fallback (mechanism stays, clamp off)." with "SHIPPED at 0.45 per
        RESULT-redkey.md — one-boot poke A/B under PREREG-redkey (validity 0 px ×16,
        night/guard/interior untaken-branch 0 px ×3, coil dispersion re-emergence + golden
        protections green)." — keep the rest of the contract note intact.
     2. `tests/redkey.test.mjs`: flip the first pin to `assert.equal(TUNE.keySatMax, 0.45,
        'shipped by RESULT-redkey — a later seal moves this only with its own RESULT cited')`;
        in the "at 1.0 the clamp is untaken" test construct
        `new Shading({ debug: { keySatMax: 1.0 } })` (the default no longer is 1.0); in the
        "null falls back to TUNE" test assert the fallback now CLAMPS to 0.45
        (`Math.abs(linSat(c) - 0.45) < 1e-9`) instead of equality with WARM.
     Run `node --test "tests/*.test.mjs"` (481+ green: 475 baseline + these 6) before the
     push. Push `git push -u origin claude/sly-cooper-ancient-egypt-0koo0u`.
   - **PF1** (any E/P/PW FAIL on a valid capture): no ship; keySatMax stays 1.0; record
     the finding (E3-only failure routes the shirt to §277's grade half explicitly).
   - **PF2** (any B ≠ 0 with its R PASSED): no ship; mechanism defect — record WHICH gate
     leaked (readbacks say whether uKeyColor moved) and fix under a new seal.
   - **PF3** (BG1/VK/V3/V4): VOID — diagnose from readbacks, archive the out-dir, re-run.
   - **PF4** (any R ≠ 0): affected blocks VOID — name the mechanism from ordinals/slots
     before re-running.
6. Frames and manifest stay in `progress/records/redkey/` (archive as `redkey-void-runN/`
   on any VOID before relaunching — PF7 enforces this).
