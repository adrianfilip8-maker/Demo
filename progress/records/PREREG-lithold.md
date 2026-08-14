# PREREG-lithold — the subject keeps its own chroma: Sly must read blue in the action frames

**Lane:** SHADING/character-colour (critic r12 queue item 2, r11 queue item 3c — §277's
saturation half; direct ancestors §287 → §288 → §289, whose `subjShadowHold` is the SHADOW
side of this same complaint). **Date sealed:** 2026-08-14.
**Status: REGISTERED before any capture. `progress/records/lithold1/` does not exist at the
time of writing and no frame of any arm has been rendered.** Runner (`lithold.mjs`), scorer
(`lithold-score.mjs`) and the offline derivation (`lithold-model.mjs`) are committed with this
file, before the capture, together with the INERT mechanism (`TUNE.subjLitHold: 0.0`,
branch-untaken) and its pin test (`tests/lithold.test.mjs`).

## 0. The defect as filed, and the part of the filing that is wrong

Both blind rounds rank it, in nearly the same words. r11: *"lit toon bands blowing Sly's blue
to white (traversal, combat)"*. r12: *"the character is bleached to grey-white; the iconic
blue is gone from the frame's own hero"* — filed for traversal and combat, partially for
sly-key/closeup, and routed as **§277's lit-side saturation half**, i.e. as §289's shadow-side
mechanism mirrored onto the key light.

**That routing is wrong, and it is refutable offline, so it is refuted here rather than with a
boot.** `progress/records/lithold-model.mjs` drives the real `Atmosphere` + `Shading` and
transcribes only `TOON_SHADE`'s diff assembly, displaying through `tonecurve.mjs` (validated
against PostFX's own grey row, 0.35 L worst). Re-runnable; every number below is its output.

**(a) The costume albedo is authored correctly** — 146 505 texels of `sly_body_fix.png`'s
torso islands, mean sRGB (19, 89, 212), hue 218.2°, linear chroma 0.990.

**(b) A warm key multiplying that albedo does not desaturate it.** Every diffuse term in the
shader is multiplied by `alb`. A product keeps the albedo's channel order unless the light
inverts it, and a warm key cannot invert a blue whose blue is ~100× its red (§269's sandstone
case inverted because sandstone's own G/R sat the wrong side of a break-even; a saturated blue
under a warm light has no such crossing). Modelled on traversal's own key:

| band | display S, base | display S, §289's hold mirrored into the key multiply |
|---|---|---|
| full key | **0.603** | 0.586 |
| mid band | 0.671 | 0.652 |
| low band | 0.683 | 0.696 |

A fully key-lit costume pixel renders at **S ≈ 0.60**. The filed fix is a null on it — and
slightly the wrong way, because it trades a little chroma for luminance.

**(c) The frames measure 0.08–0.21, so something else is doing it.** Fitting the model
(3 parameters: ramp, shadow, an achromatic additive) to the r12 frames' own measured costume
statistic:

| shot | measured lit-half display | measured S | fit: ramp | shadow | achromatic additive | fit err |
|---|---|---|---|---|---|---|
| traversal | (127, 136, 158) | **0.205** | 0.05 | 0.3 | **0.135** | 4.3 L |
| combat | (195, 185, 186) | **0.080** | 0.00 | 0.0 | **0.570** | 7.8 L |
| sly-key | (118, 173, 214) | 0.516 | 1.00 | 1.0 | 0.110 | 6.4 L |
| sly-closeup | (137, 177, 209) | 0.458 | 1.00 | 1.0 | 0.180 | 4.4 L |

The two action framings are **barely key-lit at all** and carry 1.2× / 5.2× the close-up's
achromatic additive. The blue is not being multiplied away. **It is being added over.** The
legs on the `outgoingLight` line that are NOT multiplied by the albedo are exactly `spec`
(white — `uSpecKey` 0, so not even the key's colour) and `rim` (`uRimColor` #7fd4ff at the
character's rim 0.62 × rimGain 2.05), plus PostFX's screen rim, bloom and any FX quad
composited over the character. Their share of a costume pixel grows as the character shrinks
on screen, which is the shape of the defect the critics ranked: **close-ups keep the blue,
action framings do not.** One hypothesis is eliminated on the shipped constants alone —
aerial haze is gated by `uHazeStart` 26 m and Sly is at ~10–13 m in both frames, so `slyHaze`
returns exactly 0 there; haze is not a suspect.

**What this seal is licensed to do.** Not to re-size or re-scope `spec`/`rim` — that is a
different seal on a term the whole scene shares, and §24.3's trap (narrowing the band narrows
the character's rim in the same proportion) is why it needs its own instrument. This seal
takes §289's remedy where those legs have already landed: **the subject holds its own chroma
on the assembled surface colour.** It is the same operator §269/§289 shipped — the material's
own albedo hue, carried at the light's luminance — moved from inside one band to the composite,
because the composite is where the measurement says the loss happens.

## 1. Ownership and discipline

Two src files (`src/render/shaders/toon.glsl.js`, `src/render/ToonMaterial.js`) plus the pin
test, committed INERT (bit-identical at the default; the pin test proves the spelling) before
any frame. **The capture installs nothing**: HEAD is the tree and the arms are direct pokes of
`shading.uniforms.uSubjLitHold.value` — the gradetrio/redkey no-install chassis on
torchlight3's one-boot pattern, which §302 established is the only shape in which a [0,0]
pixel bar is legitimate on this renderer. Bars sealed and pushed before any candidate frame;
no post-hoc threshold moves (§141.1); fail-closed tri-state via `tools/gate.mjs`; `ringPainter`
untouched; launched detached via `tools/launch.sh` (§298.3).

**Six lanes share this tree today**, so the tree gates are precise rather than blanket
(runner §PF6 / `onLocked`): this seal's own two files must be byte-identical to HEAD at
launch, `src/render` and `src/player` must carry NO dirt at all at lock grant or the run
aborts BEFORE booting, and foreign dirt elsewhere in `src/` is recorded in the manifest and
disclosed by the scorer's V4 row. A same-boot poke compares two arms inside one process
against one tree, so recorded foreign dirt outside the two critical chains cannot bias the
difference — but it must be quoted in the RESULT, and §BG is what catches a staging that is
not the diagnosed one.

## 2. The candidate

One TUNE key, one GLSL branch, `src/render/` only:

- `TUNE.subjLitHold` (default **0.0**): the gate is spelled `if ( uSubjLitHold > 0.0 )`, so at
  the default no arithmetic runs at all (the `uLocalToon`/`uSpecNormPow` standard).
- Placement: immediately after `outgoingLight = diff + sss + spec + metalEnv + rim +
  emissiveTerm;` and before the haze mix.
- The held endpoint: `alb * ( lum(outgoingLight) / lum(alb) )` — this surface's own albedo hue
  at the luminance the shading actually produced. **Both mix endpoints carry
  `lum(outgoingLight)` identically**, so the mix is luminance-EXACT: a chroma lever that
  cannot buy saturation with brightness, with no renormalisation term (§269's band needed one;
  this shape does not).
- Scope `* vSlySkin` — §289's gate. For a non-skinned draw the factor is exactly 0.0 and
  `mix(x, y, 0.0) == x`, so the environment cannot move; §PROT-ENV measures that rather than
  asserting it.
- Knee `smoothstep(0.0, uShadowHoldKnee, albChroma)` — §269's knee (0.25), reused not
  re-derived. An achromatic material has no hue of its own to hold: the guards' identity-white
  (albedo chroma 0.029 → gate 0.036) and Sly's white trim do not move.
- Loss `clamp(1 - outChroma/albChroma, 0, 1)` — the hold engages in proportion to the chroma
  the render destroyed. Modelled effective strength at the candidate: **0.35 on traversal,
  0.55 on combat, 0.09 on sly-key, 0.13 on sly-closeup.** This is what makes the praised
  close-ups protections the lever mostly declines to touch instead of a trade against them.
- The endpoint is the albedo's own chroma, so the hold can never exceed the material's
  authored saturation. It gives back; it does not invent.
- Shared by identity and NOT republished per frame (unlike `uSubjShadowHold`, which
  `setKeyLight` rewrites on every `nightAmount` publish), so a poke sticks across
  `__GAME.step()` — pinned by `tests/lithold.test.mjs`.

**Candidate value under test: 0.70.** Dose arm (`ko`): **0.40**, on traversal and combat.
Registered fallback: **0.0** (mechanism stays, hold off).

## 3. Tree — HEAD, no install

- HEAD at seal time: the commit that lands this file and the inert mechanism together. The
  runner records the new HEAD sha, HEAD's own `git archive` src hash, and the working-tree
  hash at lock grant; V4 requires ONE tree hash across all 68 rows, equal to the lock-grant
  hash, with this seal's two files clean at grant AND release.
- PF6 launch pins: `HEAD:src/render/ToonMaterial.js` carries `subjLitHold: 0.0`, the shared
  `uSubjLitHold` uniform, and **§289's `subjShadowHold: 1.0` still where it shipped**;
  `HEAD:src/render/shaders/toon.glsl.js` carries the declared uniform, the untaken branch, and
  §289's shadow-side hold line unchanged; roster = the 16 canonicals.

## 4. ROIs, the statistic, and the calibration (§13/§141 — disclosed)

**Disclosure, in the form §141.1 requires: I derived these rectangles and these bands by
looking at the r12 frames — the very frames that carry the defect — and the numbers in §0's
table are what I looked at.** The free parameters are fixed here, before the capture they will
be applied to exists, and the acceptance below is scored on FRESH frames. `§BG` is the
calibration made into a gate: the metric must reproduce, on the new capture's own OFF arm, the
known-bad/known-good separation it was sized on, or the run VOIDs rather than scores.

**The population.** Per shot, a costume rectangle; inside it, the **top half by luminance** —
"the lit half", operationally the part of the costume the frame reads as lit. The mask is
computed on the **OFF arm and applied unchanged to both arms**, so the two arms are compared
over identical pixels and no membership can drift under the lever. No hue or saturation gate
enters the selection: selecting "the blue pixels" and then measuring how blue they are is
survivorship, and it is the one mistake this statistic exists to avoid.

**The statistic** is mean HSV saturation `S = (max−min)/max` over that population, in display
bytes. Reported alongside, never gating except where named: mean Rec.709 luma, mean b−r, and
the chroma-weighted circular hue mean (the §293/§298 lens). Hue is NOT the bar — hue was never
this defect, and D2's hue half closed at §283/§289.

| shot | ROI rect | r12 value (calibration only — bars read the OFF arm) |
|---|---|---|
| traversal | [557, 261, 582, 291] | S **0.205**, hue 223.3, L 135.7, n 375 |
| combat | [520, 468, 566, 522] | S **0.080**, hue 353.0, L 186.9, n 1242 |
| sly-key | [600, 228, 675, 290] | S **0.516**, hue 205.4, L 164.3, n 2325 |
| sly-closeup | [592, 228, 672, 292] | S 0.458, hue 206.8, L 170.6, n 2560 |
| night (subject) | [747, 412, 767, 435] | S 0.670, L 43.7, n 230 |

**The separation the bands are sized on: 0.516 (a frame where the critic says the blue reads)
against 0.205 and 0.080 (the two frames where both critics say it is gone) — ×2.5 and ×6.4.**
That is the calibration §141.1 asks for: the metric has been run across a state known to have
the defect and a state known not to, and the separation is published next to the numbers.
In-frame corroboration, same statistic, same rects: the SHADE half of every one of these rects
is more saturated than its lit half (combat ×2.46, sly-key ×1.39, traversal ×1.04) — §289's
shipped shadow-side hold is doing its job and the lit side has no equivalent.

Protection ROIs on `sly-closeup`, scored in **DELTA form** per §288's rule (cross-arc subject
protections are never sealed as absolute corridors): MUZZLE [590, 170, 640, 212] (warm cream
fur, r12 b−r −52.8, n 2100) and TAILFUR [700, 300, 850, 430] (brown tail fur, b−r −23.5,
n 19500).

## 5. Arms and the boot (runner `lithold.mjs`; frames → `progress/records/lithold1/`)

Carried from PREREG-torchlight3 §6 / gradetrio where applicable: quality high, 1280×720,
`setShot(name, {dt:0})` → `step(3,0)` → `renderFrame(0)` staging (§251, not captured), roster
order, per-arm readbacks, PF7 fresh out-dir, no retries, no manifest resume. **ONE boot, HEAD
tree, no install.** Uniform staging disclosure: every shot stages with `uSubjLitHold` at the
inert 0.0 and the debug channels off, set explicitly before the first staging.

Per canonical shot (all 16), while the shot stays staged:

1. `uSubjLitHold = 0.0` → settle `step(2,0)` + `renderFrame(0)` → **`<shot>.off.png`**
2. `0.70` → same settle → **`<shot>.on.png`**
3. traversal and combat only: `0.40` → **`<shot>.ko.png`**
4. `0.0` → **`<shot>.back.png`** — `diff(off, back)` brackets every intervening poke

and on the six PROT-ENV shots (traversal, combat, temple, dunes, night, interior), AFTER
`back` so no debug state can reach a scored arm:

5. `postfx.debugRaw('scene')` + `shading.calibrate('term')` → **`<shot>.cal.png`** (must carry
   DEBUG_CALIB.term's (64, 128, 191))
6. `shading.debugTerm(1)` → **`<shot>.msk.png`** — R = `vSlySkin`, the exact subject mask
7. debug off, hold 0.0 → **`<shot>.bk2.png`** — `diff(off, bk2)` proves the debug state
   restored

16×3 + 2 + 6×3 = **68 frames**. Readback per arm: `uSubjLitHold`, `uSubjShadowHold`,
`uShadowHold`, `uShadowHoldKnee`, `uDebugTerm`, PostFX's raw flags, `uKeyColor`/intensity,
`uRakeTrack`, `uLocalToon`, `nightAmount`, camera Y, tod.

**Lock-hold price (§298.3): ~85–105 min** — one boot 6–9 min, 16 stagings ≈ 55 min, 68 arms
≈ 20–40 min.

## 6. Registered bars (scored by `lithold-score.mjs` through `tools/gate.mjs`; VOID is not PASS; ship = every row PASS **and** the LOOK gate)

| id | quantity | band |
|---|---|---|
| **R1–R16** (`R_<shot>`) | `diff(off, back)` decoded differing px | **[0,0]** each — nonzero VOIDs that shot's block (PF4) |
| **R2** ×6 (`R2_<shot>`) | `diff(off, bk2)` — the debug arms restored exactly | **[0,0]** each |
| **CAL** ×6 (`CAL_<shot>`) | share of the `cal` frame reading (64, 128, 191) ±1 | ≥ **5%** — else the mask channel never reached the PNG and PROT-ENV VOIDs |
| **BG** | OFF arm: `S(traversal) ≤ 0.30` ∧ `S(combat) ≤ 0.18` ∧ `S(sly-key) ≥ 0.42` ∧ `S(sly-key) ≥ 2.0 × S(traversal)` | in → else **VOID** (the staging is not the diagnosed one; §4's calibration made a gate) |
| **E1** | traversal: `S(on) − S(off)` ∧ `S(on)` | ≥ **+0.120** ∧ ≥ **0.350** |
| **E2** | combat: `S(on) − S(off)` | ≥ **+0.050** — deliberately weak, reason registered below |
| **E3** | traversal ∧ combat: `circDist(hue(on), 213.5) ≤ circDist(hue(off), 213.5) − 3.0°` | both |
| **KO** | traversal ∧ combat: `ΔS(ko)` against `ΔS(on)` | **0.35–0.85×** (dose monotone), both |
| **PC** ×2 (`PC_sly-key`, `PC_sly-closeup`) | `ΔS` ∧ `ΔmeanL` | ΔS ∈ **[−0.010, +0.100]** ∧ \|ΔL\| ≤ **4** |
| **CAL-FACE-N** | MUZZLE and TAILFUR populations alive on both arms | n ≥ **200** each — else PROT-FACE VOIDs |
| **PROT-FACE** | \|Δ(b−r)\| on MUZZLE and on TAILFUR | ≤ **7** each (§288's delta form) |
| **PROT-NIGHT** | night subject ROI: `ΔS` ∧ \|ΔmeanL\| | ΔS ≥ **−0.020** ∧ ≤ **4** (n ≥ 150 aliveness) |
| **PFR** ×4 (temple, dunes, interior, night) | whole-frame \|ΔmeanL\| ∧ \|Δ(b−r)\| | ≤ **1.5** ∧ ≤ **3.0** |
| **ENV** ×6 (`ENV_<shot>`) | differing px farther than **3 px** from the `vSlySkin` mask | **0** |
| **VC** | every arm echoes its commanded `uSubjLitHold`; `uSubjShadowHold` == 1.0 and knee == 0.25 on every arm; no debug state on any scored arm | else **VOID** |
| **V4** | 68 rows, ONE tree hash == the lock-grant hash, owned files clean at grant and release; foreign dirt disclosed | else **VOID** |
| **LOOK** | binding looking at the §9 crops | recorded in the RESULT; a look failure is **NO-SHIP** regardless of bars |

Fail-closed gating: `E*`, `KO`, `PC` are VOID unless BG PASSED and their shot's `R` PASSED;
PROT-FACE is VOID unless CAL-FACE-N and `R_sly-closeup` PASSED; `ENV_<shot>` is VOID unless
that shot's `R` and `CAL` PASSED.

**Why E2 is weak, registered before the fact.** Combat's fitted additive is 0.570 against
traversal's 0.135, and an unknown share of it is the combat trail FX quad and PostFX bloom —
both composited AFTER the surface shader, so no in-shader hold can reach them. A magnitude
band for combat would be a number about a decomposition this seal has not measured. E2 asks
only whether ANY of that wash is in-shader; the measured ΔS against the model's +0.30 at the
candidate is reported as the overlay-share estimate, which is a result either way.

**Why ENV excludes a 3 px halo, registered before the fact.** PostFX's edge detect and screen
rim read the scene colour, so a subject-only change can legitimately shift a 1–2 px band just
outside the silhouette without any environment shading having moved. The exclusion radius is
fixed at 3 px here; the count INSIDE the halo is reported next to the count beyond it.

## 7. Falsifiers — revert, do not defend

- **PF1** — E1/E3/KO/PC/PROT-* out of band on a valid capture ⇒ **no ship**: `TUNE.subjLitHold`
  stays 0.0, finding recorded. No retune toward a band; a different amount is a different
  prereg. E1 failing while E2 passes, or the reverse, is itself the finding and is recorded as
  such (see §10).
- **PF2** — any `ENV` ≠ 0 with its R and CAL PASSED ⇒ **no ship** regardless of the E bars: the
  `vSlySkin` scope leaked, which is a mechanism defect, not a tuning question. The RESULT
  reports the spatial distribution of the outside-mask pixels, because "a halo just beyond
  3 px" and "the environment shading moved" are different diagnoses.
- **PF3** — BG/CAL/VC/V4 out ⇒ capture **VOID**, diagnose from readbacks, archive, re-run.
- **PF4** — any R ≠ 0 ⇒ that shot's block VOID (within-boot sag would be a NEW finding — name
  it from the ordinal/timestamp columns before any re-run).
- **PF5** — runner killed mid-boot ⇒ nothing installed, nothing to restore; archive the
  out-dir, relaunch.
- **PF6** — launch pins fail (this seal's files dirty, flipped default, §289 moved, roster
  drift) ⇒ abort unscored. At lock grant, dirt in `src/render` or `src/player` ⇒ abort before
  booting.
- **PF7** — out-dir exists non-empty ⇒ abort; archive as `lithold1-void-runN`; relaunch.

## 8. §17 look-change declaration

On every frame where the subject's costume has lost chroma to the additive legs, Sly's blue,
the shorts' red and the cane's gold return toward their authored saturation **at unchanged
brightness** — the two action framings most, the close-ups barely (modelled effective hold
0.35 / 0.55 vs 0.09 / 0.13). Nothing else in any frame moves: the environment is outside the
`vSlySkin` scope by construction, achromatic subject materials sit under §269's knee (the
guards' identity-white takes hold 0.000), and the shade side keeps §289's band untouched.
Two consequences are named rather than discovered later: **the cane** is a skinned draw with a
strongly chromatic albedo, so it takes the hold too (modelled display (179, 150, 125) →
(186, 148, 101) — more gold, which is the direction r11/r12 asked for, but it IS a change);
and **Sly's cream fur** takes a mild hold (modelled −4 in blue at full strength), which is what
PROT-FACE's delta bars are for.

## 9. LOOK gate crops (binding)

traversal [500, 200, 700, 400] (the swing — the frame the r12 complaint quotes) and
[520, 180, 620, 260] (cap + shoulder); combat [460, 390, 700, 630] (the whole figure) and
[500, 450, 590, 540] (torso); sly-key [560, 90, 780, 640] (the praised banding must survive)
and sly-closeup [540, 150, 900, 560]; night [700, 380, 820, 480] (the moonlit read, §289's
own LOOK gate's shot); temple FULL and dunes FULL (the environment must be visibly identical).
Verdict prose goes in `RESULT-lithold.md`; "the on arm reads worse where an E-bar reads
better" is a look failure, and so is a costume that reads like a flat colour swatch instead of
a lit surface.

## 10. Registered forecast (ledger entering ~6/19)

**SHIP at 0.70, with combat the honest coin-flip.** Grounds: the mechanism is not hypothesised
but arithmetic — the operator is luminance-exact by construction and its endpoint is the
albedo itself, so the only question is how much of the loss lives in-shader; the model puts
traversal at S 0.192 → 0.438 (bar asks +0.120 and ≥ 0.350, i.e. ~½ the modelled move) and the
close-ups at +0.02 (bar allows +0.100); the poke lever class is 0-px-proven on this exact boot
pattern 42-for-42 (§303) and 16-for-16 (§307).

Honest uncertainties, named:
(a) **Combat is the riskiest row and the most informative.** If E1 passes and E2 fails, the
finding is "traversal's wash is in-shader and combat's is composited after it", which routes
combat's half to FX/POSTFX (the combat-trail re-author already queued at §304) and does not
touch this seal's verdict on traversal — but a failing E2 still blocks the ship under §6, and
that is deliberate: a lever that fixes one of the two named frames should be argued for
explicitly in a re-seal, not slipped through on a weak bar.
(b) **ENV could fail on a halo wider than 3 px** if bloom's gather redistributes a chroma
change; the model says luminance does not move, so bloom's threshold crossing should not,
but bloom is the term this model does not carry.
(c) **The LOOK gate is the real risk, not the numbers.** Pushing a surface toward its own
albedo hue is, at the limit, flat-shading it; at the modelled strengths it should read as the
costume recovering its colour, but 0.55 on combat is the highest hold in the set and it is
where "reads like a swatch" would show first.
If the capture VOIDs, the candidate neither ships nor dies — it re-runs.

## 11. SCORING RECIPE (for the coordinator; exact commands, every branch)

The runner is DETACHED (`tools/launch.sh`; §298.3). Do not wait on it interactively.

1. **Is it done?** `tail -5 /home/user/Demo/progress/records/logs/lithold-run1.log` — a
   completed run ends `DONE. Score with: node progress/records/lithold-score.mjs`.
   `ABORT`/`PF6`/`PF7` lines mean a pin fired; the log says which and what to do.
   Liveness: `pgrep -f 'lithol[d]\.mjs'` or check `/tmp/sands-of-ra/lithold1.pid` against
   `/proc`.
2. **If it aborted at lock grant** (`src/render or src/player carries uncommitted work`):
   nothing was installed and nothing was captured. Do NOT touch the other lane's files (§186).
   Wait for that work to land, verify with `git status --porcelain -- src/render src/player`,
   then relaunch (step 3). No archiving needed — the out-dir is empty on that path only if the
   abort happened before the first capture; if it is non-empty, archive it first (PF7).
3. **Relaunch (any PF5/PF6/PF7 path):**
   `mv /home/user/Demo/progress/records/lithold1 /home/user/Demo/progress/records/lithold1-void-runN`
   then
   `bash tools/launch.sh /home/user/Demo/progress/records/lithold.mjs /home/user/Demo/progress/records/logs/lithold-runN.log /tmp/sands-of-ra/lithold1.pid`
   — absolute paths; `launch OK ... ppid 1` is the only success.
4. **Score:** `cd /home/user/Demo && node progress/records/lithold-score.mjs` (exit 0 = every
   row PASS). It prints the tri-state table and the verdict line. Quote V4's disclosure row in
   the RESULT verbatim if the captured tree was not HEAD exactly.
5. **LOOK gate (binding, before any ship write):** open the `off` and `on` frames in
   `progress/records/lithold1/` and compare at the §9 crop rectangles, e.g.
   `node tools/crop.mjs progress/records/lithold1/traversal.off.png /tmp/l.off.png 500 200 200 200 4`
   and the same for `.on.png`. Record the verdict prose in `RESULT-lithold.md`.
6. **Outcome branches** (write `RESULT-lithold.md` + a KNOWN_ISSUES § in every branch):
   - **PASS + LOOK pass (ship).** §296 first: confirm no capture holds or queues on the FIFO
     (`/tmp/sands-of-ra/capture.lock` absent AND `/tmp/sands-of-ra/queue/` empty) immediately
     before touching src. Then in ONE commit citing RESULT-lithold:
     1. `src/render/ToonMaterial.js`: `TUNE.subjLitHold` `0.0` → `0.70`; in the TUNE comment
        replace the sentence *"This is the registered fallback: it ships above 0 only on
        PREREG-lithold's PASS, with the RESULT cited in this comment."* with **"SHIPPED at
        0.70 per RESULT-lithold.md — one-boot poke A/B under PREREG-lithold (validity 0 px
        ×16, subject-mask environment protection 0 px ×6, the costume's lit-half saturation
        recovered on the two action framings with the close-ups held)."** — keep the rest of
        the contract note intact.
     2. `tests/lithold.test.mjs`: flip the first pin to
        `assert.equal(TUNE.subjLitHold, 0.70, 'shipped by RESULT-lithold — a later seal moves
        this only with its own RESULT cited')`, and in "the shared uniform exists at the TUNE
        default" assert `0.70`. The other nine tests are value-independent and stay as they
        are.
     Run `node --test "tests/*.test.mjs"` (517+ green: 506 baseline + these 11) before the
     push. Push `git push -u origin claude/sly-cooper-ancient-egypt-0koo0u`.
   - **PF1** (any E/KO/PC/PROT FAIL on a valid capture): no ship; `subjLitHold` stays 0.0;
     record the finding. An E1-pass/E2-fail split routes combat's wash to FX/POSTFX explicitly
     and is the registered second-most-likely outcome (§10a).
   - **PF2** (any ENV ≠ 0 with R and CAL PASSED): no ship; mechanism defect — report the
     outside-mask pixels' distance distribution before diagnosing.
   - **PF3** (BG/CAL/VC/V4): VOID — diagnose from readbacks, archive the out-dir, re-run.
   - **PF4** (any R ≠ 0): affected blocks VOID — name the mechanism from ordinals/timestamps
     before re-running.
7. Frames and manifest stay in `progress/records/lithold1/` (archive as `lithold1-void-runN/`
   on any VOID before relaunching — PF7 enforces this).
8. **Regardless of outcome, §0's refutation is a result on its own** and belongs in the
   KNOWN_ISSUES § whatever the bars say: §277's "lit-side saturation" framing, carried by two
   blind rounds and two queue lists, names a mechanism the shader's own arithmetic cannot
   produce. The bleacher is the additive `spec`/`rim`/screen-rim/bloom family, its share grows
   as the character shrinks on screen, and sizing or scoping those terms for the character is
   the follow-up seal this run either supports or makes urgent.
