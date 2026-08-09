# PREREG — scoping the §269 shade band by camera sky-exposure (`Lighting.enclosure`)

Registered **before the candidate exists**. Everything below — instrument, criterion, threshold
*rule*, arms, bars, and the branch that decides which guard set `temple` is judged under — is
frozen at this commit. §141.1: no bar in this file moves after the first candidate frame is
scored.

Owner: LIGHTING. Files: `src/render/Lighting.js`, `src/render/ToonMaterial.js`,
`src/render/shaders/toon.glsl.js`. Nothing else is touched.

---

## 1. The question, and what is already settled

KNOWN_ISSUES §269 built a shade band derived per pixel from the material's own albedo
(`uShadowHold`) and measured it fixing critic 9's ranked D1 on daylight — `dunes` Δh 173.8° →
12.4°, `hero` 164.8° → 16.4°, against a reference that measures 11.9–30.5° on verified
single-material regions. It **ships inert** (`shadowHold 0`) because `interior` refuses it:
cool % 2.85 against a registered bar of 56.44. §269 §5 established that refusal is structural —
`interior` is at `shadowMix` 1 everywhere, so the band *is* its lighting — and its A2 control
proved the damage is not specific to the new term.

§271.3 refuted per-material scoping with two structural reasons (one shared-by-identity uniform;
8 of 12 architectural materials appear in the tomb *and* in daylight) and refuted the obvious
per-frame substitute (key radiance: `interior` runs the **brightest** key in the game, ×4.05).
§271.4 routed the scope variable to LIGHTING: `Lighting.enclosure`, a per-camera raycast fan
that is already built, already published in the key payload, and **has never had a consumer**.

This file registers the attempt to make it one. **Neither §269's mechanism nor its numbers are
re-litigated here.** What is on trial is the *scope*.

## 2. What the mechanism will be (registered before it is written)

Three edits, all in files LIGHTING owns:

1. `Lighting.TUNE.holdEnclose` — the enclosure threshold. **`-1` means scoping is off**, and at
   `-1` the fan does not run, nothing new is published, and the build is byte-identical to today.
   At `>= 0` the fan runs, and LIGHTING publishes a **decision**, not a ramp:
   `p.ambient.skyOpen = (enclosure <= holdEnclose) ? 1 : 0`, with a hysteresis band
   `TUNE.holdEncloseHyst = 0.10` so a camera parked on the threshold does not chatter.
2. `ToonMaterial.setKeyLight()` consumes `ambient.skyOpen` **only when it is a number**, writing
   `uShadowHold = TUNE.shadowHold * skyOpen`. When it is absent, `uShadowHold` is not written at
   all, which preserves the documented contract that a harness poke of that uniform sticks.
3. `_updateEnclosure` stops early-outing on `encloseStrength <= 0` alone; it runs when
   **either** consumer wants it. `_encloseFill()` keeps its own `encloseStrength <= 0` early-out,
   so **the sky-fill half of the enclosure term does not change and `encloseStrength` stays 0**
   (§269 brief, constraint 5: take only the term you need, and say so).

**The map is a threshold with a decision, never a ramp.** §269 measured `hold = 0.6` putting
`dunes` at hue 355° / sat 0.274 — muddier than either endpoint, because the blend passes through
neutral. `hold = 1 − enclosure` would drive every partially-roofed camera through that mud and is
**forbidden by that measurement**, not by preference.

**Convergence (§269 brief, constraint 4).** `enclosure` is lerped toward `_encloseTarget` at
`encloseLerp * dt`, and every capture in this project steps with `dt = 0` (§251), which pins the
step to `1/240` and moves the smoothed value by 1/60 per frame — it would **not** converge by the
captured frame. Two changes, both registered here: the fan fires immediately when the camera has
moved more than 2 m since the last probe (a teleport is not a walk), and on that same event the
smoothed value is **snapped** to the new target instead of lerped. A settle-time term that has
not converged reads as a tuning failure, so I3 below asserts convergence at the captured frame
rather than assuming it.

## 3. Instrument A — hue and populations (the §269 instrument, unmodified)

`scratchpad/hue/score.py`, the instrument frozen before §269's candidate existed. It is
re-implemented in `tools/holdscopescore.mjs` so the run is self-contained in the repo, and the
re-implementation is **calibrated against the Python original's own recorded output** (I1). Its
definitions are not restated here because they are not being changed: top/bottom 20 % of an ROI
by HSV value, HSV of each group's mean RGB, circular Δh, V ratio, both saturations; frame-wide
warm % / cool % at `sat > 0.15` with warm `h < 60 ∪ h >= 330` and cool `170 <= h < 260`, each
population's circular mean and resultant length, and the fractions below L 0.15 / above 230.

**ROIs.** `dunes (80, 545, 760, 700)` and `hero (930, 500, 1275, 715)` are §269's, frozen, and
re-used unchanged. §272 records that `hero`'s staged player moved; its ROI is courtyard floor and
§272 states the new figure does not enter it, which I5 re-checks mechanically rather than trusts.

**`temple` gets NO ROI, and this is a registered rejection, not an omission.** Three candidate
rects were cropped from `shots/r9/temple.png` and looked at (1× and 3×) before registration:

| candidate rect | verdict |
|---|---|
| floor centre `(300, 615, 780, 715)` | rejected — contains the staged player and two prop clusters |
| floor right `(430, 640, 770, 718)` | rejected — paving ink joints are a large share of the darkest quintile, so the "shade" group would be **ink**, not shaded stone |
| nave column `(400, 200, 660, 620)` | rejected — no sunlit face on it; the column is shaded top to bottom |

`temple`'s columns are shaded and its floor is lit, but they are different materials, and the
instrument's split is defined over one material. Inventing a fourth rect after seeing the
candidate would be §269 §11's failure mode. **`temple` is therefore scored frame-level only**
(warm/cool populations, dark %), plus the scope decision itself. This does not weaken constraint
2 of the brief — `temple` still decides where the threshold goes, via §4 — it only says which
statistic judges the consequence.

## 4. Instrument B — criterion C, the ground truth the threshold is fitted to

The threshold must not be placed by looking at which value makes the pictures agreeable. It is
fitted to an **independent** definition of the thing `enclosure` is a proxy for.

§269's corollary is the specification: *"hue-holding is only meaningful where a material appears
both lit and shaded in the same frame"*. Operationalised with a channel that already ships:
`shading.debugTerm(5)` writes `vec3(ramp, ndl, key)`, so the **blue channel is `key = ramp * sh`**
— the direct sun actually arriving at that pixel, shadow map included — read through
`postfx.debugRaw(true, 'scene')`.

> **litFrac(shot)** = fraction of frame pixels with B >= 13 (5 % of 255) in the mode-5 render.
> **A shot is OPEN iff litFrac >= 0.05**, and ROOFED otherwise.

The 5 % floor is a population-size floor: a frame with under 5 % sunlit pixels has no lit
population to hold a hue against, which is exactly `interior`'s case and exactly why §269's fix
does not apply to it.

`debugTerm(4)` writes the calibration constant `(64, 128, 191)`. I2 requires it to come back
**exactly**; a debug channel read through a grade is not a debug channel.

## 5. The threshold rule — registered here, evaluated by the probe, never hand-placed

Let `O` = the OPEN shots and `R` = the ROOFED shots by §4, over the ten canonical shots
(`combat`, `courtyard`, `dunes`, `hero`, `interior`, `night`, `sly-closeup`, `sly-perch`,
`temple`, `traversal`). Let `eO = max{ enclosure(s) : s ∈ O }` and `eR = min{ enclosure(s) : s ∈ R }`.

- **If `eO < eR`:** the proxy separates. `T = round((eO + eR) / 2, 3)`. That is the shipped
  `holdEnclose`. No other value is considered.
- **If `eO >= eR`:** the proxy is **REFUTED**. No threshold on `enclosure` reproduces criterion C,
  nothing ships, and the run reports the overlapping pair. This is a real and expected outcome —
  `temple` is roofed and may still be sunlit through its roof slots.

The fan casts 5 rays, so `enclosure` is quantised to multiples of 0.2 and any separation is at
least one ray wide. **The margin in rays is reported with the verdict**, and a separation of
exactly one ray must be stated as such in the ship note: the term would then be one ray from
misclassifying a camera.

## 6. Arms — ONE invocation, ONE boot, ONE tree

The provenance hazard is registered before the run, because it has already voided a run today:
`shot.mjs` takes the FIFO lock once per invocation, so env-var arms queue as separate invocations
and the working tree moves between them (the materials lane captured A0 and A1 twenty commits
apart, across a `Shots.js` change that re-framed the shots). **Every arm below is captured inside
one invocation of `tools/holdscope.mjs`, in one browser boot, from one tree**, and I3 VOIDs the
run if that is not true.

Full arms on the four decision frames — `dunes`, `hero`, `temple`, `interior`:

| arm | poke | role |
|---|---|---|
| **A0** base | none | same-run anchor. **Every delta in §8 is against this**, not against `shots/r9` — those frames are ~120 commits stale and that lane already scored a PASS on 1.27 against its own control's 1.22 |
| **A1** null | `holdEnclose = T`, `shadowHold = 0` | the scoping plumbing live at zero magnitude. **Must be byte-identical to A0** |
| **A2** control | `uNeutralShadow = 1` | **MUST FIRE**: `dunes` ROI Δh must move **≥ 20°** vs A0. §269's registered magnitude, reused. If it does not fire the instrument is not sensitive in this boot and the whole run is VOID |
| **A3** global | `uShadowHold = 1`, scoping off | §269's refused build, re-measured in this tree. Tests whether §269's numbers reproduce 120 commits later, and isolates scope from magnitude |
| **A4** candidate | `holdEnclose = T`, `shadowHold = 1` | the scoped band |
| **A5** restore | back to base | **must be byte-identical to A0**. State hygiene across a multi-shot boot |

A0 + A4 only on the remaining six canonical shots (`courtyard`, `night`, `traversal`, `combat`,
`sly-closeup`, `sly-perch`). They are not decoration: **a global term must be right everywhere it
fires**, and the warm/cool guards below are blocking on every OPEN shot captured, not only on the
four. §269's own recorded regret is that it shipped a term with an unmeasured population.

## 7. The warm/cool guard, registered BEFORE the run (§269 brief, constraint 3)

§269 flagged, in its own pre-registration and before any candidate existed, that there is **no
warm/cool guard on the daylight shots**, that both go monochrome-warm at hold 1, and that
inventing a bar afterwards would be the mis-derivation §141.1 forbids. It refused to invent one.
Here it is, derived now, from the only ground truth either critic has.

Derived at this commit with the frozen instrument on `sly3-venice.jpg` (1151×647, the reference
frame critic 9 judged against; reference frames are never committed, `SLY3REF`):

```
reference   warm 32.8446 %   cool 17.3236 %   dark 18.9493 %
            warm hue 46.41 (R 0.987)   cool hue 190.31 (R 0.973)
```

- **G6 (absolute).** `cool_pct(A4) >= 12.993` on every OPEN shot with `tod >= 0.2` **whose own
  same-run A0 already clears 12.993**.
  *Amendment, made before any candidate frame existed and from BASE frames only.* Scored on the
  stale `shots/r9` set purely to see which shots the bar is even meaningful for, the shipped
  build already sits at `combat` **cool 10.32 %** — below the bar, at base, with nothing this lane
  does. A guard no candidate could pass is not a guard on the candidate; it is a guard on a
  pre-existing condition belonging to another lane. So on a shot whose A0 is already under the
  bar, G6 is reported N/A with both numbers printed, and G7 — which is relative and cannot have
  this failure mode — still applies. The r9 numbers this was decided from, all A0-side:
  `combat` 10.32, `sly-perch` 30.39, `sly-closeup` 36.50, `courtyard` 31.33, `traversal` 46.29,
  `temple` 45.85, `dunes` 18.82, `hero` 53.31. **The amendment excuses `combat` and nothing else**
  — every shot this run turns on clears the bar at base by 1.4× to 4×, so it does not touch the
  outcome, which is why it is safe to make and why it is recorded here in full rather than
  applied quietly.
  `12.993 = 0.75 × 17.3236`. The 0.75 is not chosen here: it is the factor §269 used to build its
  own protection guard (G5, `0.75 × baseline`), applied to the reference instead of to us.
  **Scoped to daylight deliberately:** the reference is a daylight frame, and applying a daylight
  bar to `night` — a shot whose whole brief is a palette flip — would be a category error.
- **G7 (same-run, all OPEN shots including `night`).** `cool_pct(A4) >= 0.50 × cool_pct(A0)`.
  The fix may not halve the frame's cool mass. This one is content-neutral and needs no reference.

**Cross-check, stated before the run:** this project already recorded a rejection at this
statistic — `ToonMaterial.js` on `shadowWash`, *"Zero measured best on every palette metric but
took `hero` to cool% 9.8, which is pass 2's monochrome-warm failure re-entered from the other
side"*. G6's 12.99 sits above that recorded rejection point and G7's `hero` bar would land near
it, so two independently constructed bars bracket a level the project has already refused once.

**A limitation registered in advance, so it cannot become an excuse afterwards.** The reference's
cool mass is substantially cool *albedo* — §269 measured two teal stones on it whose saturation
*rises* into shade — and our desert palette has almost none. If G6/G7 fail while every hue guard
passes, the finding is **"the held band trades away the frame's only cool mass, and the warm/cool
tension §2.1.3 requires must be re-sourced from the sky, the fill or the palette"**, routed
onward. It is **not** a reason to move the bar.

## 8. Guards (frozen). Tri-state through `tools/gate.mjs`; VOID is not PASS

**Validity — any of these VOID the run or the statistic they cover.**

- **I1 instrument calibration.** `tools/holdscopescore.mjs` re-scores `shots/shold/dunes-A0-base.png`
  and `shots/shold/interior-A0-base.png` and reproduces the frozen Python instrument's recorded
  `shots/shold/scored.json` to `|Δ| <= 0.01` on `dh`, `vratio`, `lit.s`, `sha.s`, `warm_pct`,
  `cool_pct`, `dark_pct`. A re-implementation that has not reproduced the original is a different
  instrument.
- **I2 AOV calibration.** The `debugTerm(4)` render's modal RGB is **exactly** `(64, 128, 191)` and
  covers `>= 20 %` of the `hero` frame. Otherwise every criterion-C reading is VOID.
- **I3 same tree.** Three other agents commit to this working tree while a capture runs, so
  "`HEAD` did not move" is the wrong test — it would VOID on a `progress/` commit that cannot
  reach the build, and it would pass a `src/` edit that was committed before boot and picked up
  by a late module request. The registered test is on **content that can reach the render**: a
  SHA-256 over every file under `src/` (sorted by path) is recorded at boot and again after the
  last arm, together with `git rev-parse HEAD` and `HEAD:src` at both moments. All arms live in
  one boot with `SANDS_NO_HMR` (vite's watcher ignores everything and HMR is off), so the arms
  are comparable **iff** the `src/` digest is unchanged. **If the digest differs, the run is
  VOID**; if only `HEAD` moved, that is recorded in the result and is not a VOID.
- **I4 convergence.** At the captured frame, on every probed shot,
  `|enclosure − _encloseTarget| <= 0.01`, and `|enclosure − T| >= 0.05` (no shot sits inside the
  hysteresis band). Otherwise the scope decision for that shot is VOID.
- **I5 ROI validity.** Inside each scored ROI, the mode-5 key map must show **both** populations:
  `>= 5 %` of ROI pixels with B >= 13 **and** `>= 5 %` with B < 13. An ROI with only one of them
  cannot measure a lit-to-shade rotation, and its Δh is VOID rather than PASS.

**Calibration arms that MUST FIRE.**

- **C1** A2 moves `dunes` ROI Δh by **>= 20°** against A0. (A null arm proves repeatability, not
  sensitivity.)
- **C2** A1 byte-identical to A0 on all four decision shots.
- **C3** A5 byte-identical to A0 on all four decision shots.

**Ship guards, all on A4, all deltas against the same-run A0.**

- **G0 scope.** The threshold rule in §5 returned a separating `T` (not REFUTED), and the
  `enclosure`-derived OPEN/ROOFED partition equals criterion C's partition on all ten canonical
  shots, with no shot VOIDed by I4.
- **G1** `dunes` ROI Δh `<= 45.0°` **and** `<= Δh(A0) − 100°`. The 45.0 is the critic's own
  loosest reference reading (44.9°), not one of ours; the −100 is the same-run delta.
- **G2** `hero` ROI, same two conditions.
- **G3** ROI V ratio ∈ `[0.20, 0.75]` on `dunes` and `hero` (§269 G3: the shadow must still read
  as shadow — this forbids buying hue with brightness).
- **G4** ROI shade saturation `>= sha.s(A0) − 0.05` on `dunes` and `hero` (§269 G4 re-based on the
  same-run control instead of on r9).
- **G5 protection.** Every ROOFED shot captured is **byte-identical** between A4 and A0. If the
  scope works, the protected frames are not merely close, they are untouched. This replaces
  §269's G5a/G5b/G6 with a stronger and unambiguous test; those bars stay in
  `tools/shadowholdscore.mjs` for the global arm A3 and are reported for it.
- **G6 / G7** as registered in §7, on every OPEN shot captured.
- **G8** `node --test "tests/*.test.mjs"` reports **0 failures**, and the pass count is not lower
  than the base tree's.
  *Amended before the mechanism was written and before any candidate frame existed.* The brief
  named 445/445; the tree was at **447/447** by the time I ran it, because two other lanes added
  tests in the meantime, and it is **452/452** after the five this lane adds
  (`tests/holdscope.test.mjs`). A fixed count on a tree three other agents are committing to is a
  bar that measures who committed last, not whether anything regressed, so the substance — zero
  failures, nothing lost — is what is registered.

**Ship rule.** Ship `holdEnclose = T` and `shadowHold = 1` only if every guard above is PASS.
Anything else: the mechanism stays in the tree inert at `holdEnclose = -1` and the result says
why. VOID is not PASS.

## 9. Forecast — scored afterwards, right or wrong

1. `interior` returns `enclosure = 1.0` (all five rays blocked) and `litFrac < 0.005`.
2. `temple` returns `enclosure = 0.8` — the +z ray leaves the roof past z −16, per the fan's own
   note — and `litFrac` **0.05–0.30**, i.e. `temple` lands in OPEN and the rule returns `T = 0.9`
   with a **one-ray margin**.
3. `dunes`, `hero`, `courtyard`, `night`, `traversal`, `combat`, `sly-*` all return
   `enclosure = 0.0`.
4. The proxy separates (not REFUTED), so G0 passes.
5. `dunes` A3 Δh reproduces §269 run 2 to within 3° of 12.4, and A4 equals A3 on `dunes`
   byte-for-byte (same decision, same uniform).
6. **G6 fails on `dunes` and `hero`.** Predicted `cool_pct(A4)` 2–5 % against a bar of 12.99.
7. **G7 fails on the same two shots**, predicted `cool_pct(A4) / cool_pct(A0)` ≈ 0.15.
8. `temple` A4 loses most of its cool as well — its column mass is the teal — and fails G6/G7 at
   `cool_pct` 5–15 %.
9. `interior` A4 is byte-identical to A0, so G5 passes and the §269 blocker is dissolved by the
   scope.
10. Net: **the scope works and the band still does not ship**, blocked on a guard §269 asked me to
    register and that I registered before running. If that is the result, the honest report is
    that the scope variable is correct, the blocker moved from `interior` to the daylight
    warm/cool balance, and the next lever is the sky/fill, not this file.

I am recording forecast 10 in full knowledge that it makes this run a refutation of my own
preferred outcome. Refuting your own claim is a successful run; moving the bar in §7 after seeing
§8 would not be.
