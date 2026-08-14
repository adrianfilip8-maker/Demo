# PREREG-fxink2 — FX exclusion from the ink, take 2: scoped at FX RASTER TIME (TUNE.fxInkCut over an FX-drawn coverage mask, one boot, poke arms)

**Lane:** POSTFX/FX artifact family (critic r11 family 3: "ink on transparent FX — combat's
porcelain-rimmed trail"; and the shafts half, "temple's volumetric shafts are inked like
celluloid"). **Parent:** PREREG-fxink.md + RESULT-fxartifact §2 + KNOWN_ISSUES §306 — the seal
this one replaces, whose ROI, FXCOV/INKREMOVED instruments, E bands and containment band are
carried here VERBATIM.
**Date sealed:** 2026-08-14.
**Status: REGISTERED before any capture. `progress/records/fxfix2/` does not exist and no frame
of any arm has been rendered.** The mechanism landed INERT and pin-tested in commit `7a06bf1`
(`tests/fxink2.test.mjs`); runner `progress/records/fxfix/fxfix2.mjs` and scorer
`progress/records/fxfix/fxink2-score.mjs` are committed with this file. This seal has its OWN
boot — the sibling run `fxfix1` (PREREG-fxghost2 / PREREG-rimfloor2) was already queued when
this mechanism was designed, and a seal does not get to reach into a run that is waiting.

## 1. Ownership and discipline

Torchlight3 §1 carried verbatim: bars sealed and PUSHED before any candidate frame; §141.1;
fail-closed (VOID is not PASS); DETACHED launch via `tools/launch.sh` with absolute log/pidfile
paths; per-capture tree stamps (§296); same-boot per-shot `off`/pokes/`back` with a strict
`[0,0]` bar as the ONLY valid pixel-identity form on this renderer (§302/§303).

**`ringPainter` is UNTOUCHED — D12 absolute.** The combat ring is the defect's *subject*, and
this seal covers it rather than editing it: not one byte of `EMITTERS`, `ringPainter`, or any
FX authoring constant is in this seal's ship surface. The FX-side change the mechanism did make
is a *coverage branch* that is only entered during a pass that does not run at the shipped
value; every FX draw's colour output is byte-identical.

**This run installs NOTHING.** The lever is `postfx.tune.fxInkCut`, re-read per frame, on a
mechanism already in HEAD and inert. This seal's SHIP surface is ONE constant:
`src/render/PostFX.js` `TUNE.fxInkCut` — written only on PASS, only at a clear lock, per §8.

## 2. What the parent measured, and why the signal moved

PREREG-fxink's mechanism claim was sound about the *defect* and wrong about the *signal*. The
defect: the ink mask is derived from the OPAQUE scene's depth+normal buffers (FX opt out of the
normal prepass and write no depth), and the composite stamps that mask over the FINISHED frame,
so a bright FX volume in front of inked geometry wears the geometry's lines. A hand-inked cel
paints the FX over the line art; this composite does the opposite. Nothing about that changed.

The signal was scene ALPHA — `max(alpha − 1, 0)`, on the argument that only additive FX push a
pixel's alpha past 1. **Falsified on a fully valid run** (RESULT-fxartifact §2; V1/V2 green, R
`[0,0]` ×11, BG_donut 95,910 px, E1 6,248 px, E2 123.5 L — the efficacy half passed):

| shot | changed px (off→bon) | containment in the FX footprint |
|---|---|---|
| hero | 13,834 | **36.3%** |
| sly-profile | 78,231 | **24.9%** |
| night | 6,656 | **25.4%** |
| combat | 75,045 | 59.6% |
| temple | 34,901 | 56.0% |

All eleven C bars FAIL. **Where the leaked pixels are** (mapped offline for this seal, 2026-08-14,
PNG arithmetic only over the committed `fxartifact1` frames: changed px painted red where they
fall outside the `bfx0` footprint, blue where the footprint is): they lie **on the ink lines
crossing the sunlit floor POOLS** — `hero`'s lit patch through the doorway, `temple`'s lit floor
and column bases — with no FX quad within a hundred pixels, while the actual FX footprint (the
blue: shaft slabs, motes, sparkles) is mostly *not* where the gate fired. World decals blend
into the same alpha the gate reads. **Composite arithmetic over a finished frame cannot
separate "an FX volume is in front of this pixel" from "something else also blended here",** and
no threshold on that signal was going to; §306 routes the follow-up to the FX draw itself.

**The candidate.** `FX.beginMaskPass()` puts the participating FX materials into coverage mode;
PostFX renders `fx.root` into a coverage target; the composite multiplies the ink line down by
that coverage:

```
if ( uFxInkCut > 0.0 ) {
  line *= 1.0 - clamp( uFxInkCut * texture2D( uFxMask, vUv ).r, 0.0, 1.0 );
}
```

Four properties, each checked rather than asserted (`tests/fxink2.test.mjs`):

1. **Containment is construction, not argument.** A pixel no FX quad covered has mask 0 and
   keeps every bit of its ink. The C bars below therefore stop being the seal's risk and become
   its *implementation check* — if they fail now, the mask pass is drawing something it should
   not, and the seal says so.
2. **Participation is enumerated.** Particle batches, light shafts, flames, sparkles and trails
   — everything in `fx.root` that draws a VOLUME in front of the scene. World **decals are
   excluded**: a decal is a mark ON a surface, exactly like the ink, so cutting ink beneath one
   would erase the drawing rather than cover it — and they are the falsified gate's leak site.
3. **Occlusion is handled where the shader can.** `PARTICLE_FRAG`, `SHAFT_FRAG` and `FLAME_FRAG`
   already carry `uDepth` + `vViewZ`, so the coverage branch discards fragments behind the
   opaque scene by hand (the mask target has no depth attachment). `SPARKLE_FRAG` and
   `TRAIL_FRAG` carry neither: an OCCLUDED sparkle or trail segment marks the mask there, which
   over-cuts ink rather than under-cutting it. **Registered as a known limitation, measured by
   the C bars, not assumed away** — if it costs containment, the C bars fail and the finding is
   "the two shaders need the depth uniform", which is a mechanism result, not a verdict.
4. **0 is the shipped image by CONTROL FLOW on both sides** — the mask pass does not run and
   the gate branch is not entered, so the sampler stays unbound and the ink line is untouched.

## 3. Arms, ROIs and instruments

All 11 roster shots, staged once each: `hero`, `temple`, `sly-closeup`, `courtyard`, `dunes`,
`interior`, `night`, `traversal`, `guard`, `sly-profile`, `combat`. `combat` stages **LAST** via
the §275.1 rewind recipe (`engine.time = 0; setShot('combat', {dt: 1/60})` → t = 0.2833, the
fxdraw/fxshape/fxartifact staging) because the swing band is a particle-age phenomenon and a
`{dt:0}` staging ages it 0 (§275: measured, alpha exactly 0).

Arms per shot, RESTORE-FIRST from the all-base state, `{dt:0}` settle, §40 readbacks,
per-capture tree stamp:

`off` (fxInkCut 0, fx.root visible) → `bfx0` (`fx.root.visible = false` — the FX footprint
reference) → `bon` (fxInkCut **1.0**) → `b50` (fxInkCut **0.5**) → `back` (all base).

Registered ROIs and sets, computed same-boot:

- **DONUT** combat [0,330,1279,539] — PREREG-fxink §3's ROI, verbatim.
- **SHAFTBAND** temple [500,60,1150,520] — NEW, for the second named defect ("volumetric shafts
  inked like celluloid"). Drawn on the committed `fxartifact1/temple.*` frames before any arm of
  this run exists: it is the screen band the `bfx0` footprint shows the shaft slabs occupying.
- **FXCOV(shot, ROI)** = px in ROI with `L(off) − L(bfx0) ≥ 25` — the FX's own contribution.
- **INKREMOVED(shot, ROI)** = px ∈ FXCOV with `L(bon) − L(off) ≥ +8` — ink the gate lifted.
- **Containment** = fraction of changed px (`|ΔL| ≥ 2`, off→arm) inside the r=6-dilated
  footprint (`|ΔL| ≥ 1`, off→bfx0). PREREG-fxink §4's instrument, verbatim.

## 4. Registered bars (scored by `fxink2-score.mjs`; VOID is not PASS)

| id | quantity | band |
|---|---|---|
| V1 | one src content hash across all rows | else VOID |
| V2 | §40 readbacks: `uFxInkCut` composite uniform = commanded, `fx.root` visibility as commanded, the FX coverage flag back at 0 after every capture | else VOID |
| V3 | `postfx.ok === true` and zero page console errors at every row | else VOID |
| V4 | at the `bon`/`b50` rows the composite's `uFxMask` is BOUND (non-null); at `off`/`back` it is null | else VOID (the mask pass did not run — a green gate over an unbound mask would be scoring nothing) |
| R_&lt;shot&gt; ×11 | `diff(off, back)` strict px | **[0,0]** each, fail-closed per shot |
| BG_donut | \|FXCOV(combat, DONUT)\| | **≥ 20,000 px** else the combat block is VOID |
| BG_shaft | \|FXCOV(temple, SHAFTBAND)\| | **≥ 20,000 px** else the temple block is VOID |
| E1 | \|INKREMOVED(combat, DONUT)\| | **≥ 500 px** |
| E2 | mean L(off) over INKREMOVED(combat, DONUT) | **≤ 165** (the lifted px were ink-dark under a bright band) |
| E3 | \|INKREMOVED(temple, SHAFTBAND)\| | **≥ 500 px** (the shafts half of the defect) |
| C_&lt;shot&gt; ×11 | containment | **≥ 99%**; changed = 0 ⇒ PASS (the gate moved nothing there) |
| P_monotone ×11 | Σ darkening / Σ brightening over changed px (\|ΔL\| ≥ 2) | **≤ 0.25** — the ink pass is strictly SUBTRACTIVE (`ink = min(…, c)`), so removing ink can only BRIGHTEN a pixel; a gate that reached something which is not the ink term would darken |
| LOOK | §5 | **BINDING**, adjudicated in the RESULT off the scorer's crops |

Every E band and the C band are PREREG-fxink §4's at their sealed values; `BG_shaft`, `E3`,
`V3`, `V4` and `P_monotone` are new. **No band has been loosened** — the parent's candidate
failed containment at 99%, and a follow-up that dropped that bar would be §141.1's exact
prohibition. The whole point of moving the signal is that 99% should now be free.

**How `P_monotone`'s 0.25 was set, before this run's first frame.** The first draft of this bar
counted darkened PIXELS and set the band at 1%. Measured on the PARENT run's committed frames
(`fxartifact1`, the falsified candidate — which was also a strictly-subtractive ink gate, so
everything it darkened is antialiaser, not mechanism) that statistic runs **2.5%–13.3%** across
the eleven shots, and it runs highest exactly where the changed set is SMALLEST (`dunes` 3,473
px → 13.3%). FXAA runs after the composite and ripples 1–2 px either way at every edge the gate
moves, so a pixel COUNT measures the antialiaser wherever the effect is small. The summed
ENERGY does not: the same frames give a darken/brighten energy ratio of **0.011–0.152** (median
0.035, `dunes` again the ceiling). The band is set at **0.25** — 1.6× the worst observed ripple,
and more than 4× below the ~1.0 a genuinely darkening gate would produce. Recorded here rather
than adjusted later, because a bar rewritten after its own run's numbers is §141.1's prohibition
and a bar rewritten after its PARENT's numbers, disclosed, is calibration.

**Ship rule (registered):** the FIRST arm in this order whose bars ALL pass, and whose crops
pass the LOOK gate, ships as `TUNE.fxInkCut`: **`bon` (1.0)** — the cel-correct value, full
removal in proportion to the FX's own coverage — then **`b50` (0.5)** as the half-strength
fallback if 1.0 fails a LOOK item while passing mechanically. No arm qualifying → no ship (§6).

## 5. §17 look declaration and the LOOK gate

Intended change: geometry ink fades under FX in exact proportion to the FX's own coverage —
combat's swing band stops wearing the wall's rectilinear lines; temple's shafts stop carrying
the columns' and floor's contours through their cores; flames and trails stop being crossed by
the lines of whatever is behind them. NOT intended: any change where no FX quad drew (the C
bars hold that at ≥99%), any change to the FX themselves, any bloom change, any ink change on
world decals (they are excluded from the mask by construction).

LOOK gate (all BINDING, adjudicated in the RESULT off the scorer's crops):
1. **combat band 4×, off vs arm** — the porcelain contour gone, the band's own soft edge intact;
2. **temple shaft band 3×, off vs arm** — the shaft reads as light, not as a celluloid sheet
   with the room's line art printed on it; the geometry OUTSIDE the shaft keeps its ink;
3. **interior flame region 3×** — sane, and the ink on the surrounding stone unchanged;
4. **hero and night whole-frame 1×** — the falsified candidate's two worst leak shots: the ink
   on the sunlit floor pools must be EXACTLY as it was. This is the gate the seal exists to
   carry, and a mechanical C pass with visibly softened floor ink is a FAIL;
5. **traversal 1×** — markers and rails unharmed.

The five roster shots NOT captured (`kaykit`, `sly-key`, `sly-startle`, `sly-perch`, `sly-arm`)
take the shipped default on the construction argument alone (mask 0 ⇒ ink untouched) — recorded
as residual exposure, as the parent recorded it.

## 6. Falsifiers and outcome branches — revert, do not defend

1. **PF1 (the mask over-draws):** any `C_<shot>` < 99% on a valid capture ⇒ the coverage pass is
   marking pixels the FX draw does not cover. The two most likely causes are already named in
   §2.3 (occluded sparkles/trails, which have no depth uniform) and the fix is a mechanism
   change, not a threshold change ⇒ **NO SHIP**, finding + the offending px classified per shot
   in the RESULT, routed to a follow-up that gives those two shaders `uDepth`/`vViewZ`.
2. **PF2 (inert):** `E1` < 500 with `BG_donut` PASS, or `E3` < 500 with `BG_shaft` PASS ⇒ the
   gate does not act where the defect is ⇒ NO SHIP; the decomposition (does the mask cover the
   band at all? the FXCOV census answers it) goes in the RESULT.
3. **PF3 (staging):** `BG_donut` or `BG_shaft` < 20,000 ⇒ that block VOIDs — the band or the
   shafts did not stage; re-run with the same recipe before touching anything (a staging miss is
   not a candidate verdict).
4. **PF4 (the gate darkens):** any `P_monotone` > 1% ⇒ the gate is reaching something that is
   not the ink term ⇒ NO SHIP, and the mechanism is wrong in a way the C bars cannot see.
5. **PF5 (validity):** V1/V2/V3/V4 out, or any `R_<shot>` ≠ 0 ⇒ affected blocks VOID,
   fail-closed; archive `mv progress/records/fxfix2 progress/records/fxfix2-void-runN`,
   diagnose, relaunch. No resume.
6. **PF6 (LOOK):** mechanical PASS but a LOOK item fails ⇒ the binding gate kills that arm; the
   rule steps to `b50`; both failing ⇒ no ship. Do not retune toward the band (§141.1).

## 7. Registered forecast (ledger per §303)

**`bon` (1.0) ships (~55%); `b50` ships (~10%); no ship ~35%.**

Grounds: the efficacy half already passed on the parent's run with a *worse* signal (E1 6,248
px, E2 123.5 L), and this signal is a superset of the true FX coverage restricted to the FX
draw, so E1 should hold or improve. Containment is now structural. The 35% is concentrated in
PF1 through the two depth-less shaders — `sly-profile` and `traversal` are the shots where a
trail or sparkle is most likely to sit behind geometry, and `combat` has the most trail area of
any shot in the roster.

Honest uncertainties, named before the frames: (i) the mask is written by materials whose blend
modes differ (additive batches ACCUMULATE coverage in the mask, normal-blended ones REPLACE it),
so the mask is a coverage-like quantity rather than an exact alpha — bounded in [0, ∞) and
clamped by the gate, but it means a dense additive stack cuts ink to zero slightly sooner than
its visual opacity would suggest; (ii) the shafts' own `a` term is the volumetric density, not
an opacity, so `E3`'s 500-px floor is the honest guess of a threshold rather than a derived one
— and on the PARENT's frames the same statistic came to **121 px**, i.e. the falsified alpha
gate barely acted on the shafts at all, which is either the reason E3 exists or the reason it
will fail; the coverage mask is supposed to be the difference and the run is what says so;
(iii) FXAA runs after the composite and will ripple 1–2 px at every edge the gate moves, which
the C bars' r=6 dilation absorbs by design.

## 8. SCORING RECIPE (exact commands; every outcome branch)

The runner is DETACHED and will queue behind the sibling run `fxfix1` and five other lanes.

1. **Is it done?** `tail -5 /home/user/Demo/progress/records/logs/fxfix2-run1.log` — done = the
   last lines are `DONE. Score with:` + the scorer path. `ABORT`/`PF` lines: the log says which
   guard fired. Liveness: `pgrep -f 'fxfix[2]\.mjs'` (bracket pattern) or check
   `/tmp/sands-of-ra/fxfix2.pid` against `/proc`.
2. **Score:** `cd /home/user/Demo && node progress/records/fxfix/fxink2-score.mjs` (exit 0 =
   some arm passed mechanically). Then LOOK at `progress/records/fxfix2/crops/fxink2-*` — §5 is
   BINDING, and item 4 (hero/night floor ink) is the one the parent's candidate died on.
3. **PASS (mechanical + LOOK) → ship-write.** §296 first: confirm
   `/tmp/sands-of-ra/capture.lock` absent AND `/tmp/sands-of-ra/queue/` empty IMMEDIATELY before
   touching src, and `git status` shows no other lane mid-edit in `src/render/PostFX.js`. Then
   ONE commit citing `RESULT-fxink2.md`, staging ONLY these paths:
   - `src/render/PostFX.js`: `fxInkCut: 0.0` → the chosen value, and replace the knob comment's
     last paragraph with: "SHIPPED at &lt;v&gt; per RESULT-fxink2.md (PREREG-fxink2 one-boot poke
     A/B): E1 &lt;n&gt; px on the combat band, E3 &lt;n&gt; px on the temple shafts, containment
     &lt;pct&gt;% on 11 shots, R [0,0] ×11 — the coverage mask is the FX draw, so the ink outside
     it is untouched by construction and measured untouched."
   - `tests/fxink2.test.mjs`: flip the inert assertion to the shipped value; keep every other
     assertion, including the one that the falsified alpha-excess expression is not in the tree.
   - `node --test "tests/*.test.mjs"` — all green before push. `RESULT-fxink2.md` +
     KNOWN_ISSUES § in the same push.
4. **PF1/PF2/PF4/PF6 (no ship):** NO src write. `RESULT-fxink2.md` + KNOWN_ISSUES § with the
   per-shot containment table, the leaked-pixel classification, and the routing.
5. **PF3/PF5 (VOID):** archive `mv progress/records/fxfix2 progress/records/fxfix2-void-run1`,
   diagnose, relaunch with
   `bash tools/launch.sh /home/user/Demo/progress/records/fxfix/fxfix2.mjs /home/user/Demo/progress/records/logs/fxfix2-run2.log /tmp/sands-of-ra/fxfix2.pid`.
