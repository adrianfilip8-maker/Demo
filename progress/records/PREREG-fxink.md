# PREREG-fxink — FX exclusion from the edge-detect ink: the composite stops stamping geometry lines over additive FX (TUNE.fxInkCut, one boot, poke arms)

**Lane:** POSTFX/FX artifact family (critic r11 family 3: "ink on transparent FX (combat's
porcelain-rimmed trail)"). **Date sealed:** 2026-08-13.
**Status: REGISTERED before any capture. `progress/records/fxartifact1/` does not exist and
no frame of any arm has been rendered.** Runner `progress/records/fxartifact/fxartifact.mjs`
(SHARED with PREREG-fxghost / PREREG-seamglint; this seal scores and ships independently),
scorer `progress/records/fxartifact/fxink-score.mjs`, candidate
`progress/records/fxartifact/PostFX.cand.js` + `fxink-cand.patch` — all committed with this
file, before any capture.

## 1. Ownership and discipline

Torchlight3 §1 carried: bars sealed+pushed before any frame; §141.1; fail-closed; detached
launch via `tools/launch.sh`; §186 install-under-lock ONLY (the candidate file is written to
`src/render/PostFX.js` inside the runner's lock window from the committed cand bytes and
sha-verified restored before release — install AND restore hashes pinned); §296 (no src
commit while any capture runs or queues; per-capture tree stamps). This seal's src surface is
exactly ONE file: `src/render/PostFX.js`. `ringPainter` (and every FX byte) UNTOUCHED — D12
absolute: the fix is composite-side, working around the ring content, which is another
lane's re-author item.

## 2. The defect and the mechanism, measured before sealing

r11 (verbatim): "ink on transparent FX (combat's porcelain-rimmed trail)". Looked at on
`shots/r11/combat.png` at 4-5× (crops in the session record): the pale swing band crosses
the wall, and the wall's block-edge INK LINES continue across the band uninterrupted — every
dark contour on the band is RECTILINEAR wall geometry, not a band-shaped feature. Mechanism,
from reading the shipped chain end-to-end: the ink mask is derived from the OPAQUE scene's
depth+normal buffers (FX opt out of the normal prepass and write no depth — Particles.js /
Trails.js onBeforeRender gates), and COMPOSITE_FRAG stamps that mask over the FINISHED frame
— so any bright transparent FX in front of inked geometry wears the geometry's lines. A
hand-inked cel paints FX over the line art; this composite does the opposite.

The candidate (fxink-cand.patch, 6 splices, all in PostFX.js):

- `TUNE.fxInkCut: 0` — documented knob; **0 = IEEE-exact no-op** (`clamp(0·x)=0`,
  `line *= 1.0` exact);
- COMPOSITE_FRAG: the centre scene tap fetched whole (`.g` identical); the ink block gains
  `line *= 1.0 - clamp( uFxInkCut * max( slySceneC.a - 1.0, 0.0 ), 0.0, 1.0 );`
- uniform init + per-frame re-read (`cu.uFxInkCut.value = this.tune.fxInkCut`) so
  `postfx.tune.fxInkCut` is a live poke (§40 readback = the composite uniform).

Why scene ALPHA is the right signal (verified in source before sealing): opaque toon draws
tag alpha `1 − slyMetal ≤ 1` (SLY_METAL_TAG, ToonMaterial.js:1328); the sky dome writes
exactly 1 (Sky.js:471); normal-blended transparency converges toward 1
(ONE/ONE_MINUS_SRC_ALPHA on alpha); the shafts' custom blend is bounded by 1; world decals
multiply with dst-alpha ONE — and **ADDITIVE FX are the only writers that push alpha PAST 1**
(three r185 sets `blendFuncSeparate(SRC_ALPHA, ONE, ONE, ONE)` for AdditiveBlending; the
scene RT is HalfFloat and does not clamp). So `max(alpha−1, 0)` is the accumulated
additive-FX coverage and exactly 0 everywhere else: ring, trail, flash, sparkle, flame gate
the ink in proportion to their own density; the sand/dust/smoke veils (normal-blended) do
NOT gate it; metal pixels under-gate by their metalness — **every failure path keeps ink**.

## 3. Arms, pins and instruments

Pins (PF6, checked at launch AND at lock grant): `HEAD:src/render/PostFX.js` sha256
`35f7d36fcaff06a8412cc4734dcf3d07823282aaf86d1fe2c38de457a8ed8b49`; cand sha256
`1bb7d7be7e3453a82360187fa09cbd103d3d102e15e474ec9efd88116ebffc43`; expected install/restore
whole-src hashes computed at launch from `git archive HEAD` + the swap and verified live
both ways. A foreign PostFX.js landing between seal and launch ⇒ abort unscored, re-derive.

All 11 roster shots carry this seal's arms (`off` → … → `bfx0` (fx.root hidden — the FX
footprint reference) → `bon` (tune.fxInkCut = 1.0) → … → `back`). `combat` stages LAST via
the §275.1 rewind recipe (`engine.time = 0; setShot('combat', {dt: 1/60})` → t = 0.2833, the
fxdraw/fxshape staging) because the swing band is a particle-age phenomenon and a dt-0
staging ages it 0 (§275: measured, alpha exactly 0) — torchlight3's combat.off frame shows
no band. Every arm is captured within ONE staging by pokes only ({dt:0} settles), so the
off/back bracket holds regardless of the staging recipe.

**Recorded analytic premise (torchlight3 §4 form, replaces any cross-tree pixel bar):** the
CAND tree at `fxInkCut = 0` is the same picture function as HEAD. Grounds: (1) the gate
multiplies by exactly 1.0 at 0 (`clamp(0·x) = 0`; IEEE `x·1 = x`); (2) the `.g` refactor
fetches the same texel and feeds the same channel expression; (3) within-boot poke exactness
is measured by every R bar; (4) a cross-boot pixel bar on this premise is §296.3's
unachievable class (measured twice, §302). The ship-time pin test holds the spelling.

Registered combat ROI: DONUT [0,330,1279,539] (the staged band's screen band at t=0.2833;
r11's live frame spans it). Sets, computed same-boot: FXCOV = px in DONUT with
L(off) − L(bfx0) ≥ 25 (the band's own add); INKREMOVED = px ∈ FXCOV with
L(bon) − L(off) ≥ +8 (ink that the gate lifted).

## 4. Registered bars (scored by fxink-score.mjs; VOID is not PASS)

| id | quantity | band |
|---|---|---|
| V1 | one src content hash across all rows == expected install hash | else VOID |
| V2 | §40 readbacks (uFxInkCut composite uniform = commanded; fx.root vis; others base) | else VOID |
| R_<shot> ×11 | diff(off, back) strict px | **[0,0]** each, fail-closed per shot |
| BG_donut | \|FXCOV\| | **≥ 20,000 px** else the combat block is VOID (band absent at staging) |
| E1 | \|INKREMOVED\| | **≥ 500 px** |
| E2 | mean L(off) over INKREMOVED | **≤ 165** (the lifted px were ink-dark under a ~200+ band) |
| C_<shot> ×11 | changed(off→bon, \|ΔL\|≥2) contained in r=6-dilated footprint(off→bfx0, \|ΔL\|≥1) | **≥ 99%**; changed = 0 ⇒ PASS (the gate moved nothing there) |
| LOOK | §5 | **BINDING**, adjudicated in the RESULT off the scorer's crops |

Ship = every row PASS ∧ LOOK PASS ⇒ `TUNE.fxInkCut` ships at **1.0** (§6 recipe).

## 5. §17 look declaration and the LOOK gate

Intended change: geometry ink fades under bright additive FX in exact proportion to the FX's
accumulated coverage — combat's band stops wearing the wall's lines; flames, sparkles and
trails stop carrying ink through their cores. NOT intended: any change where no additive FX
is present (C bars hold that at ≥99%/0), any change to the FX themselves, any bloom change.
LOOK gate (binding, in the RESULT): combat band crops before/after — the porcelain contour
gone, the band's own soft edge intact; night lanterns and traversal markers unharmed;
interior flame region sane. The five roster shots NOT captured (kaykit, sly-key,
sly-startle, sly-perch, sly-arm) take the shipped default with only the analytic argument
(the gate moves nothing where alpha ≤ 1) — recorded as residual exposure.

## 6. Falsifiers and outcome branches — revert, do not defend

1. **PF1 (leak):** any C_<shot> < 99% on a valid capture ⇒ the alpha signal reaches
   something that is not additive FX ⇒ NO SHIP, candidate withdrawn, finding + the offending
   px classified in the RESULT (this is fx22's D1 lesson applied to this design).
2. **PF2 (inert):** E1 < 500 with BG_donut PASS ⇒ the gate does not act where the defect is
   ⇒ NO SHIP; decomposition recorded (is the band normal-blended after all? the readback +
   alpha census in the RESULT answers it).
3. **PF3 (staging):** BG_donut < 20,000 ⇒ combat block VOID — the band did not stage; re-run
   with the same recipe before touching anything (a staging miss is not a candidate verdict).
4. **PF4 (validity):** V1/V2 out, or any R ≠ 0 ⇒ affected blocks VOID, fail-closed; archive
   `fxartifact1/` → `fxartifact1-void-runN/`, diagnose, relaunch.
5. **PF5 (killed mid-boot):** `git status` shows `src/render/PostFX.js` modified ⇒
   `git checkout HEAD -- src/render/PostFX.js`; archive the out-dir; relaunch.
6. **PF6 (pins):** HEAD PostFX moved between seal and launch ⇒ abort before any boot,
   unscored; re-derive the candidate from the mkcand anchors against the new HEAD and
   re-pin in a seal amendment (bands untouched).

## 7. Registered forecast

**SHIP at 1.0** (~80%). The mechanism is arithmetic on verified blend state; the containment
risk is FXAA edge ripple (absorbed by r=6 dilation + the 1% allowance) and MSAA alpha
resolve at quad fringes (proportional by design). Honest uncertainties: (i) the staged band
at t=0.2833 may cover fewer ink lines than r11's phase — E1's 500-px floor could go hungry
on a valid staging (PF2 records it; the floor is derived from the r11 crossing-line density,
not from a frame this run produced); (ii) some opaque material outside the toon family may
write alpha < 1 and under-gate — fails toward shipped behaviour, invisible to every bar.

## 8. SCORING RECIPE (exact commands; outcome branches)

1. **Done?** `tail -5 /home/user/Demo/progress/records/logs/fxartifact-run1.log` — done =
   `DONE. Score with:` + three scorer paths. Liveness `pgrep -f 'fxartifac[t]\.mjs'`.
2. **Score:** `cd /home/user/Demo && node progress/records/fxartifact/fxink-score.mjs`
   (exit 0 = mechanical PASS). Look at `progress/records/fxartifact1/crops/fxink-*`.
3. **PASS + LOOK → ship-write.** §296 first: `/tmp/sands-of-ra/capture.lock` absent AND
   `/tmp/sands-of-ra/queue/` empty IMMEDIATELY before touching src. Then ONE commit citing
   RESULT-fxink.md:
   - `cp progress/records/fxartifact/PostFX.cand.js src/render/PostFX.js` (the candidate IS
     the plumbing; verify sha256 == the §3 cand pin), then set `fxInkCut: 0` → `1.0` and
     replace the knob comment's last paragraph with: "SHIPPED at 1.0 per RESULT-fxink.md
     (PREREG-fxink one-boot poke A/B: E1/E2 green, containment ≥99% on 11 shots, R [0,0]
     ×11)."
   - `tests/fxink.test.mjs` (new): read `src/render/PostFX.js`; assert TUNE carries
     `fxInkCut: 1.0` (message cites RESULT-fxink.md); assert the shader carries the exact
     gate line `line *= 1.0 - clamp( uFxInkCut * max( slySceneC.a - 1.0, 0.0 ), 0.0, 1.0 );`
     and the declaration `uniform float uFxInkCut;` (the premise's spelling pin).
   - `node --test "tests/*.test.mjs"` — 475+ green before push. RESULT-fxink.md +
     KNOWN_ISSUES § in the same push.
4. **PF1/PF2:** no src write; RESULT + KNOWN_ISSUES § with the classification/decomposition.
5. **VOID:** archive out-dir → `fxartifact1-void-runN/`, relaunch via
   `bash tools/launch.sh progress/records/fxartifact/fxartifact.mjs progress/records/logs/fxartifact-run2.log /tmp/sands-of-ra/fxartifact1.pid`.
