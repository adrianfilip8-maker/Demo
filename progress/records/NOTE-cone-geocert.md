# NOTE-cone-geocert — ROUTE 2 geometric certification of the §17 guard-heading risk

**Owner:** FX. **Date:** 2026-08-06. **Requested by:** coordinator decision §179 (route 2).
**Subject:** does `SHOT_POSE.guard.towardCamera 0.35 → −0.20` harm the guard's read?
**Instrument:** `progress/records/fxcluster1/geocert.mjs` → `geocert.json`.
**No capture, no lock, no src edits, no git.** Every input is a committed constant quoted with
its line, or a committed probe value from the a2/a3/a4 readbacks.

This exists because a4's photometric no-harm gate could not be certified: `a4-harmsearch.json`
showed **42 site×form combinations, five same-state samples across two boots, best E/N 0.32,
30 of 35 flipping sign** — the guard's visible region carries per-arm particle noise that
swamps any photometric statistic. Route 2 answers the same question from the pose solve, which
carries no particle RNG at all.

---

## 1. Precondition: is the pose solve actually deterministic?

Route 2 is only legitimate if the geometry it reads is stable. **It is, and the evidence is
empirical rather than argued.**

`Guard.js:_solveShotPose` (`:1758-1838`) contains no RNG, no `dt`, no `engine.time` and no frame
counter. Its inputs are the camera matrix (fixed by the shot), a fixed distance sweep
(`d = minDist … maxDist` step 0.5, `:1782`), `col.groundCheck`/`col.raycast` against static level
geometry, and the `SHOT_POSE.guard` constants (`:152-161`). Deterministic by construction.

**Twelve stagings across three independent boots (a2, a3, a4) agree bit-for-bit:**

| | stand pos | yaw (base/base2/restore) | yaw (cand) | forward (cand) | drift |
|---|---|---|---|---|---|
| a2, a3, a4 — all 12 arms | (−15.487, 0, 27.545) | −0.0691 | **−0.628** | (−0.588, 0, 0.809) | **0** |

No nondeterminism found. Had one been found it would have been recorded here and route 2 would
have failed honestly; it was looked for and is absent.

**One probe field must not be misread:** every arm reports `setShot.onScreen: false`. That flag
is about **Sly, not the guard** — `Debug.js:_subject` (`:26`) tests `character.root`, and Sly is
correctly out of frame in this shot. It is not a guard-framing failure.

## 2. Method, and its validation against a committed independent result

A z-buffered point rasteriser over the guard's **authored** surface, projected through the
committed camera (pos (−11.5, 2.6, 30.5), fwd (−0.884, −0.241, −0.402), fov 38°, 1280×720):

- torso lofted from `GuardModel.js` `SPECS.temple.torso` (`:534-549`, `[y, halfX, halfZ, zOffset]`)
- head ellipsoid at `headC` (0, 1.760, −0.010) radii `headR` (0.222, 0.206, 0.232) (`:557`)
- muzzle wedge `snoutLen` 0.40 along +forward; two ears `earLen` 0.30; legs below the hips
- frontmost sample per pixel wins; a pixel is **key-lit** if its normal faces `keyDir`, **rim-lit**
  if it faces `rimDir`

Key at the shot's probed `tod 0.10`: `Atmosphere.js`'s own tables and `sampleTable`/`dirFrom`
ported verbatim (`:46-72`, `:269-273`) give **sun elevation −41.5°** — far below the horizon, so
the sun cannot be the key (if it were, nothing in frame would be lit, which the committed frames
refute). Key is the **moon at elevation 28.25°, azimuth 305.25°**. Rim is §2.1.5's anti-key
azimuth lifted 42° (`Atmosphere.js:385-387`).

**Validation (the DIGEST's "validate a tracer against a control before trusting it"):**
`PREREG-fxcluster` §0.1's independent CPU port put the solved head at px **(864, 244)**. This
instrument, written separately, puts it at **(863.3, 244.4)** — agreement inside 1.5 px. No
number below was read before that check passed.

**Occlusion, stated as a limitation and handled.** The rasteriser models the guard, not the
scene's occluders, and the committed frames show the §152 plinth slab eating him below y ≈ 300:
per-row activity on a3/a4 frames runs 97.6 / 88.2 / 88.7 / 88.0 % moving down to y 300, then
5.2 % at y 300-320, then **exactly 0.0 %** — every row y ≥ 310 is bit-identical across all four
arms. So the **operative** figures below are restricted to the visible band y < 300; the
full-figure numbers are reported beside them and are the ones to ignore.

## 3. The numbers

At 5.603 m the guard subtends **186.6 px/m**.

| quantity | base (0.35) | cand (−0.20) | change |
|---|---|---|---|
| **silhouette area, visible band (px)** | 6 092 | **6 117** | **+0.4 %** |
| **key-lit fraction, visible band** | 0.7804 | **0.6098** | **−17.06 pp** |
| **rim-lit fraction, visible band** | 0.6231 | **0.6938** | **+7.07 pp** |
| **key-OR-rim fraction, visible band** | 0.9961 | **0.8888** | **−10.73 pp** |
| off-frontal angle | 57.4° (three-quarter) | **89.5° (near-exact profile)** | +32.1° |
| **muzzle projected length** | 65.6 px | **74.6 px** | **+13.7 %** |
| ear separation | 50.9 px | 35.5 px | −30.3 % |
| silhouette bbox | x 761.6–913.4, y 184.8–640.3 | x 749.7–914.5, y 185.1–640.8 | — |
| surface samples off-frame | **0** | **0** | — |
| *(full figure, incl. occluded — for reference only)* | 27 122 px, lit 0.4555 | 23 879 px, lit 0.5050 | −12.0 %, +4.95 pp |

**Registered §7.2 content — "Guard character + patrol light cone".** Share of the cone's ground
pool projecting inside the frame (`Guard.js:1593`, `:1603-1611`; `reach` is not probed, so both
the authored throw and the floor the code guarantees at `coneMinThrow` 0.55 are given):

| | base (0.35) | cand (−0.20) |
|---|---|---|
| pool in frame, full throw (15.0 m) | 7.7 % | **29.2 %** |
| pool in frame, guaranteed floor (8.25 m) | 16.0 % | **54.2 %** |

The cone apex projects at (860, 306) in **both** arms — it does not move, because the apex is his
eye and his stand is identical. At −0.20 the far edge of the pool comes back inside the frame
(x −542 → **+138** at the guaranteed floor). This independently reproduces `PREREG-fxcluster`
§0.1's beam-body sweep (in-frame share 7.4 % → 34.5 %) by a different route.

## 4. Verdict, claim by claim

| claim | verdict |
|---|---|
| **The guard's silhouette does not shrink.** | **CERTIFIED.** Visible silhouette 6 092 → 6 117 px, **+0.4 %**. The −12 % on the full figure is entirely below the plinth and never seen. |
| **Nothing leaves frame.** | **CERTIFIED.** Both bboxes sit inside 1280×720 with ≥ 365 px of margin on the right and 749 px on the left; **0 of ~1.1 M surface samples** project outside the frame in either arm. |
| **The jackal head stays legible in profile.** | **CERTIFIED, and improved.** The muzzle — `GuardModel.js:1107`'s "single strongest species read" — projects **+13.7 % longer** (65.6 → 74.6 px) because a profile presents it unforeshortened. Ears converge 50.9 → 35.5 px but remain separately resolvable at 35 px. |
| **The registered patrol cone stays in shot.** | **CERTIFIED, and improved 2.0–3.4×** (7.7 → 29.2 %, or 16.0 → 54.2 %). This is the treatment's purpose and it is delivered. |
| **The lit three-quarter read does not narrow.** | **NOT CERTIFIED — the §17 risk is real and is now quantified.** Key-lit coverage of the visible silhouette falls **17.06 pp**, from 78.0 % to 61.0 %. |

### The §17 risk: not dismissed, bounded

§17 declared the risk as "his body yaw turns ~30° lens-away". Measured, the turn is **+32.1° of
off-frontal angle**, landing him at near-exact profile, and it costs **17.06 pp of key-lit
coverage**. That is a real change and this note does not certify it away.

What bounds it:

- **Rim coverage moves the other way, +7.07 pp**, because the rim rides the anti-key azimuth and
  he turns into it. §7.3 fails a shot for "no rim light separating silhouettes from the
  background"; by that criterion the cand arm is *better* separated.
- **89 % of his visible silhouette still carries key or rim** (0.9961 → 0.8888). The share
  carrying neither goes from 0.4 % to 11.1 % — an eighth of his visible surface, not a half.
- **The trade is legible in one sentence:** he exchanges 17 pp of key-lit surface for a
  13.7 % longer muzzle, 7 pp more rim, and 2–3.4× more of the registered cone in frame.

**This is a look judgement with numbers attached, which is what route 2 was asked to produce.**
FX's position: the four certified claims cover everything the §17 declaration put at risk except
the lit fraction, and the lit fraction's loss is offset in the one channel §7.3 actually fails
shots over. **We do not recommend blocking the ship on the −17.06 pp**, and we do not claim the
authority to clear it — per §179 (2) the ship is already held behind the guard-staging work, and
the near-black wedge CRITIC-sbs3 named will change the backdrop this silhouette is read against.
**Re-run `geocert.mjs` after that lands**: it takes seconds, needs no capture, and the rim/key
split is exactly what a changed backdrop moves.

## 5. Limitations, stated

1. **Occluders are not modelled.** Handled by restricting to the measured visible band; the
   plinth edge at y ≈ 300 is taken from committed frames, not from geometry.
2. **The surface is the authored spec, not the skinned pose.** `SHOT_POSE.guard` holds clip
   `look_around` at t 1.15 with `look [0.30, −0.05]` (`:156`), so the head carries a small
   look-at offset this model does not apply. It affects both arms identically and cannot
   manufacture the 32.1° yaw difference under test.
3. **Lit/unlit is a facing test, not a shading model** — no shadow casting, no `SHADOW_FLOOR`
   14 % lift, no bounce. It answers "can this surface see the key", which is the question the
   §17 risk poses, and it is applied identically to both arms.
4. **`reach` is not probed**, so the cone footprint is bracketed rather than pinned. Both bounds
   favour the same conclusion.

## 6. Files

`progress/records/NOTE-cone-geocert.md` (this note);
`progress/records/fxcluster1/geocert.mjs` + `geocert.json` (the instrument and its output).
Inputs, all previously committed: `fxcluster1/a2-readback.json`, `a3-readback.json`,
`a4-readback.json`; `fxcluster1/a4-harmsearch.json` (why route 2 exists);
`PREREG-fxcluster` §0.1 (the port this instrument is validated against).
No `src/**` was read for anything but constants, and none was modified.
