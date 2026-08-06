# PREREG-staging1 — `guard` camera translated 1.75 m west: the named occluder leaves the subject, the composition does not move

**One shot, one owner, one lever.** This seal covers **`guard` only**. CRITIC-sbs3 gap #2 (combat's
missing recipient) is **not sealed here and must not be**: its mechanism is a `SHOT_POSE` key in
`src/ai/Guard.js`, which is **GUARDS'** file, and `src/core/Shots.js` has no field that can place a
guard (`applyShot` passes `{ name, shot }`; `_poseForShot` reads only `name`). The measured spec for
that leg — including the finding that the shipped, unmodified solver lands a recipient **0.216 m**
from the impact anchor — is handed over in `NOTE-combatguard-staging.md` §1.3. The two gaps share a
module and not an owner, so they get one seal and one routing, not one seal over two files.

**Diagnosis of record:** `progress/records/NOTE-combatguard-staging.md`. Every anchor below is
measured on the committed `progress/records/sbs3/guard.png` by a scorer that reproduces nine of
CRITIC-sbs3's ten published guard/combat numbers **exactly** and the tenth to 0.07% (calibration
table in the NOTE §0). Source read at `378975d`.

---

## 0. What is being fixed, in one line

The near-black glossy wedge CRITIC named but no round located is the **west colossus plinth's gilded
cavetto cornice** (`src/world/EgyptLevel.js:462`, `hieroglyph_gilded`, `Kit.cornice({ w: 7.888,
d: 6.888, h: 0.12, roll: 0.26, flare: 0.34 })` at (−9.5, ·, 25)). Its west fillet arris sits at world
**y = 2.000, x = −14.004** by source arithmetic and **x = −14.03 ± 0.09** by unprojecting the traced
edge from the frame — agreement to 3 cm. It is 3.0–4.4 m from the lens, it covers **26.8–29.4% of
the frame**, and it cuts the subject at **world y = 1.675 m of his 1.95 m: 86% of the guard is behind
it, and so is all of his contact ground.**

---

## 1. The candidate — two vectors, nothing else

`src/core/Shots.js`, the `guard` entry, translated **−1.75 m on x only** (position *and* target, so
the view direction is bit-identical):

| | shipped | candidate |
|---|---|---|
| `pos` | `[-11.5, 2.6, 30.5]` | **`[-13.25, 2.6, 30.5]`** |
| `target` | `[-17.0, 1.1, 28.0]` | **`[-18.75, 1.1, 28.0]`** |
| `fov` | 38 | 38 (unchanged) |
| `tod` | 0.10 | 0.10 (unchanged) |
| `player` | `{ pos: [-9.0,0,31.5], yaw: 2.3, pose: 'sneak_idle' }` | unchanged |

**Why the subject does not have to be re-staged.** `Guard.js:_solveShotPose` computes the stand as
`camPos + dir·d + right·lateral`, reading the **live** camera. Translating `pos` and `target` by the
same vector leaves `dir`, `right`, `fov` and the selected `d = 5.0` untouched, so the stand
translates identically: **(−15.487, 0, 27.545) → (−17.237, 0, 27.545)**. Verified by re-running the
solver loop: **feet px (844, 625) and head px (864, 244) are identical in both arms.** The subject's
projected size, position and framing are unchanged by construction; only what is in front of and
behind him changes. This is the property that makes the lever cheap and the prediction sharp.

**Sly stays out of shot.** `Shots.js`'s header says he is deliberately behind this camera. He is at
depth **−1.98 m** (behind) at base and **−3.53 m** (further behind) at cand — the move increases the
margin. Registered as a check, not a hope.

**Why 1.75 and not more or less.** Modelling the plinth group as four AABBs and ray-casting per
screen sample, the worst lateral axis of the guard's silhouette clears the occluder at **west
1.60 m**. 1.75 buys 0.15 m of margin and still leaves a **3.38%** dark corner at bbox
**(1039, 557)–(1279, 719)** — so §7.3's "no dark foreground framing element" checkbox keeps a tenant.
West ≥ 2.0 m removes the plinth from the frame entirely, which is the over-move and is the known-bad
arm, not the candidate. The AABB model is deliberately **conservative**: its boxes are 8 cm wider
than the built cornice profile, so the real threshold is at or below 1.60.

**Costs, stated up front.** The west peristyle (x = ±23) comes 1.75 m nearer and its share of the
left-hand frame grows an estimated 15–20%. The brazier at (−18, 0, 22) and the doorway light pool
shift right in frame. The stand→brazier distance improves only **6.25 → 5.77 m**, so this lever
**does not claim to light the guard** — see §1.1.

### 1.1 What this candidate does NOT claim

- It does **not** light the guard. FX still owns the patrol cone (air column medL **27.59**, its
  heading candidate never shipped) and LIGHTING/TEXTURES still own gold-renders-dark. A 0.48 m
  improvement in brazier distance is noise.
- It does **not** retire "our guard is darker than a 2004 bear". It reframes it: the NOTE §2.4 shows
  the 18.64 everyone has been quoting is **80.8% doorway void by area**, and the guard's own warm
  pixels already read **medL 33.6–38.3**, inside the comparand's 32.57–40.7 band. That is a
  denominator finding (§128.2), it is stated in the NOTE, and it is **not** the thing this seal is
  gated on.
- It does **not** touch `_solveShotPose`'s two structural defects (a scorer with no luminance term;
  a single chest-height occlusion ray that is exactly why the shipped stand passes while 86% of him
  is hidden). Those are GUARDS' and are routed, not sealed.

---

## 2. Registered quantities — sealed before capture

**Conventions (§122.1, stated with every count).** Rec.709 luma on 0–255 sRGB bytes,
`L = 0.2126R + 0.7152G + 0.0722B`. **NBC ("near-black cool") = `L < 72 AND (B − R) > +12`** — the
wedge's own measured signature (its median RGB is 9/22/42). Differing-pixel counts, where used, are
at `ΣRGB ≥ 4`. All rects are on 1280×720 frames. Arms: **`base`** (shipped values), **`cand`**
(west 1.75), **`KBover`** (west 4.00), **`restore`** (shipped values re-captured).

**Base gates (P-F3 — VOID, not FAIL, if out):** the base arm must be the frame this seal was
diagnosed on.

| gate | band | sbs3 anchor |
|---|---|---|
| guard mass (790,100,980,330) medL | [17.5, 19.8] | 18.64 |
| doorway pool (220,360,640,560) medL | [108, 119] | 113.46 |
| projected figure feet px y / head px y (from the solver, re-derived in-run) | 625 ± 12 / 244 ± 12 | 625 / 244 |

| id | quantity | rect / predicate | band (cand) | base anchor |
|---|---|---|---|---|
| **P1** | **figure-column NOT-NBC share** | (820, 244, 900, 625) | **[70%, 100%]** | **15.9%** |
| **P2** | **dense-mass top row** — topmost py of the contiguous block of rows in x ∈ [800,930] that are ≥60% NBC and reaches py 719 | | **[560, 720]** (720 = absent) | **306** |
| **P3** | NBC share of the lower-right quadrant (640,360,1280,720) | | **[0%, 70%]** | **89.6%** |
| **P4** | warm-pixel count inside the figure rect (820,244,900,625), warm = `B − R < 2` | | **[2500, 14000]** | **692** |
| **P5** | warm-pixel medL inside that rect (the guard's own body must not get darker) | | **[26, 55]** | **29.99** |
| **P6** | figure rect (820,244,900,625) medL | | **[26, 70]** | **23.18** |
| **P-F4** | `restore` vs `base` differing px, frame-wide, `ΣRGB ≥ 4` | | **[0, 0]** | — |
| R1 | *reported, not gated:* cone air column (700,300,850,500) medL | | — | 27.59 |
| R2 | *reported, not gated:* CRITIC's guard mass rect (790,100,980,330) medL | | — | 18.64 |
| R3 | *reported, not gated:* frame-wide NBC share | | — | 38.49% |

**P1–P3 are the gap-#3 claim. P4–P6 are the honesty gates** (the subject must actually be *there* and
must not have been darkened to win P1–P3). **R2 is deliberately ungated**: after the move that rect
no longer contains what it contained, and gating a rect whose meaning changed is the §144 hazard.

**Bands are bands, not points (§133.1).** P1's model prediction is ~95–100% and P2's is 720
(absent); the bands are set wide enough that a correct result with unmodelled unlit floor in the
lower right still passes, and narrow enough that the base arm fails every one of them.

### 2.1 Calibration — the metric has a scale at both ends (§13, §141.1)

**Run already done, offline, on committed frames.** P1's predicate across all ten `sbs3` shots at the
identical rect:

| dunes | temple | hero | interior | traversal | sly-closeup | courtyard | combat | **guard** | night |
|---|---|---|---|---|---|---|---|---|---|
| 99.7% | 93.0% | 87.0% | 76.1% | 71.6% | 57.9% | 57.3% | 51.9% | **15.9%** | 0.9% |

and P2's across five: courtyard/hero/dunes **720** (no such mass at all), guard **306**, night **243**.
So neither metric is constant, both span their range, and `guard` is the outlier on both — the
defect is what they are reading.

**Stated limitation, not papered over:** `night` scores 0.9% on P1 and 243 on P2 without having a
plinth in it. Both predicates say "dark and cool", not "plinth". They cannot, alone, distinguish
"the wedge left" from "the frame got brighter". That is why **P2 (a geometric row, not a share)** is
gated alongside P1, why **P4/P5 gate that the subject is present and not darker**, and why **P-F5
below fires on any replacement occluder**.

### 2.2 Known-bad arms

- **`KBover` (west 4.00 m: pos `[-15.5, 2.6, 30.5]`, target `[-21.0, 1.1, 28.0]`).** Modelled
  occluder share **0.00%**, bbox `None` — the plinth is gone from the frame entirely. It must read as
  its own failure via **P3 < 15%** (the dark foreground framing element §7.3 asks for has been
  deleted). If `KBover` does *not* drive P3 below 15%, the metric cannot see an over-move ⇒
  **UNSCOREABLE**.
- **`base` doubles as the under-move known-bad**, and this is stated rather than assumed: it is the
  arm the metric must reject, and it anchors P1 at 15.9%, P2 at 306, P3 at 89.6%. Together with
  `KBover` the metric has an anchor at each end of every gated quantity. No third boot is spent on a
  synthetic under-move; if the coordinator wants one, west 0.75 m is the value (modelled figure
  visibility ~30%).

---

## 3. P-falsifiers — revert, do not defend

- **P-F1** — any gated band (P1–P6) outside on the `cand` arm ⇒ **the two vectors are reverted to
  `[-11.5, 2.6, 30.5]` / `[-17.0, 1.1, 28.0]`.** No retune toward a band. A different distance is a
  different prereg.
- **P-F2** — `KBover` fails to read as its own failure (P3 ≥ 15%) ⇒ **UNSCOREABLE**, no verdict in
  either direction.
- **P-F3** — a base gate out ⇒ that chunk is **VOID** (the tree/staging is not the diagnosed one),
  not FAIL. `sbs3/guard.png` was captured at `167c508`-dirty; the tree has moved, so this is a live
  possibility and it is a void, not a result.
- **P-F4** — `restore` ≠ `base` at 0 px (`ΣRGB ≥ 4`) ⇒ every arm number in that boot is void
  (banda1's precedent; the boot was not deterministic).
- **P-F5 — the replacement-occluder falsifier.** If the `cand` frame contains a connected NBC mass
  of **≥ 5% of frame** whose bbox touches a frame edge and which is **not** the residual plinth
  corner (predicted bbox (1039,557)–(1279,719), ≈3.4% of frame) ⇒ **REVERT.** The move traded one
  near-field occluder for another, which is a worse outcome than the defect and the AABB model
  cannot see it because it only knows about the colossus group.
- **P-F6 — the premise falsifier.** If the in-run solver readback puts the guard's projected feet or
  head more than **±12 px** from (844, 625) / (864, 244) on the `cand` arm, the pure-translation
  premise failed (almost certainly `groundCheck` returning a different y at the new stand). The
  registered rects are then not measuring the subject ⇒ **verdict WITHHELD**, re-anchor the rects,
  re-seal. Not a FAIL — a wrong instrument, not a wrong result.
- **P-F7 — pre-capture, offline, before any lock is taken.** `tools/camclear.mjs` must report the
  `cand` camera **clear**, and a landmark projection at 1280×720 must confirm Sly is behind the
  camera. `Shots.js`'s own header records two shipped camera defects (`temple` framing from 0.78 m
  inside a column; `b81747d` putting the eye inside the throne) that this check exists to prevent.
  A non-clear result ⇒ the candidate is **withdrawn before capture**, not tested.

---

## 4. §17 look-change declaration

**This is a look change to a canonical shot and is declared as one.** §7.2's contract for `guard` is
*"Guard character + patrol light cone"*, and that contract is the standard this is measured against.

**What visibly changes in `guard`:**
- The near-black glossy mass in the lower right shrinks from **~27% of the frame with its arris
  cutting the subject at 86% of his height** to a **~3.4% corner at (1039,557)–(1279,719)** that
  touches no part of him. His **ground contact becomes visible for the first time** (the 0.6 m disc
  around his feet is occluded at base, clear at cand) — which is the "if the guard reads as
  ungrounded, that is a real problem" case `Shots.js`'s own header flags.
- The guard's **projected size and screen position do not change at all** (feet (844,625), head
  (864,244) in both arms). What appears is the 86% of him that was already being rendered behind an
  occluder.
- The **west peristyle background comes 1.75 m nearer** and grows an estimated 15–20% in the left
  half; the brazier and the doorway light pool shift right.
- `tod`, `fov`, `roll`, exposure, the player's position/yaw/pose, and every material and light are
  **untouched**.

**Blast radius: exactly one shot.** The edit is two array literals inside `SHOTS.guard`. No other
`SHOTS` key, no shared constant, no module outside `src/core/Shots.js`. Verifiable by diff, and any
other shot captured in the same chunk must be **0 px** against its base arm.

**Not declared, because not claimed:** no change to the guard's lighting, his materials, the patrol
cone, or the gild. Those remain FX / LIGHTING / TEXTURES items and this seal credits itself with
none of them.

Ships only through this A/B, and lands with its own `KNOWN_ISSUES` entry quoting this file and
`NOTE-combatguard-staging.md`.

---

## 5. Capture plan — chunked per §163/§164

Arms are **source values in `src/core/Shots.js`**, not runtime pokes: `Debug` exposes `SHOT_NAMES`
but not `SHOTS`, so there is no page-side handle on the shot table. Therefore **one arm per boot**,
`SANDS_NO_HMR=1`, launched via `tools/launch.sh` (never `pgrep -f`), each chunk taking its own FIFO
lock hold and **committing its PNG to `progress/records/staging1/` before releasing**. A between-runs
edit is the mechanism here, not a hazard — each arm is a separate boot that reads the tree at boot.

| chunk | tree state | shots captured | commits |
|---|---|---|---|
| 0 | shipped | *(none — offline)* | `tools/camclear.mjs` on the cand camera + landmark projection (P-F7). No lock. |
| 1 | shipped | `guard` | `staging1/guard-base.png`, `report-base.json` |
| 2 | cand vectors | `guard` | `staging1/guard-cand.png`, `report-cand.json` |
| 3 | west 4.00 vectors | `guard` | `staging1/guard-kbover.png`, `report-kbover.json` |
| 4 | shipped (reverted) | `guard` | `staging1/guard-restore.png` — P-F4 |

One shot per boot, so each chunk is short. **Scoring happens at the first wake after DONE, before
anything else (§163.2).** A missing `shots/` directory after a rollback is not evidence about
whether a run happened (§14, §139.3) — the committed PNG is the record.

If the container rolls back mid-plan, resume at the first chunk whose PNG is **not** committed.
Chunks are independent: chunk 2 does not depend on chunk 1 having been scored, only on chunk 1's PNG
existing.

---

## 6. Decision table

| outcome | action |
|---|---|
| P-F7 fails offline | withdraw before capture; no lock taken |
| base gates out | chunk VOID, re-boot; three voids ⇒ re-diagnose against the current tree |
| P-F6 fires | verdict WITHHELD, rects re-anchored, re-seal |
| `KBover` fails P3 < 15% | UNSCOREABLE — no verdict either way |
| P-F4 nonzero | boot void, re-run |
| P-F5 fires | REVERT (occluder traded, not removed) |
| all of P1–P6 in band, P-F4 = 0, KB reads | **SHIP** the two vectors; `KNOWN_ISSUES` entry; hand `guard` to CRITIC round 4 as the first ship this shot has ever received |
| any of P1–P6 out | REVERT the two vectors; report which and by how much |

---

## 7. Routing that is NOT sealed here (carried from `NOTE-combatguard-staging.md`)

- **CRITIC-sbs3 gap #2, staging half → GUARDS.** Add `SHOT_POSE.combat` to `src/ai/Guard.js`. The
  shipped solver with **`screenSide: +1`** selects `d = 5.0` and stands a guard at **(0.102, 0,
  29.035)**, **0.216 m** from the impact anchor at **(0.3146, 1.3849, 28.996)** — i.e. the flash
  already goes off inside his chest. `screenSide: −1` misses by 2.038 m. Ship with a reaction clip
  (`stunned`/`ko`), not `look_around`. Three hazards to carry: `spec.x`/`z`/`yaw` are dead fields
  with no reader; `_poseForShot` never restores `g.position` and the combat stand is **0.97 m from
  the player spawn** four other shots stage on; and the recipient would cover **x 392…510** of Sly's
  cane-hook silhouette. All measured, all in the NOTE §1.
- **CRITIC-sbs3 gap #2, colour half → FX + SHADING.** Sly's 22 blue px. Untouched by any of this.
- **`_solveShotPose`'s scorer → GUARDS.** No luminance term; one occlusion ray to chest height, which
  is precisely why the shipped stand passes while 86% of the subject is hidden. NOTE §3.1.
- **`hieroglyph_gilded` reading near-black at night → TEXTURES / SHADING.** Zero pixels above L180 in
  a 240k-px mass. The standing gold-renders-dark family; `uGoldGlint` is committed at zero gain.

---

## 8. Files of this seal (coordinator sweep list — no git run by this task)

- `/home/user/Demo/progress/records/NOTE-combatguard-staging.md`
- `/home/user/Demo/progress/records/PREREG-staging1.md` (this file)

No `src/**` touched, no captures taken, no lock tickets held, no git run.
