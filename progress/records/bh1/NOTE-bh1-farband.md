# NOTE-bh1-farband — why BH1's far band held zero pixels

**Scope.** RESULT-guardcone §4 sets the successor's step 2: *"must first establish why BH1's far band
is empty — a bar that cannot be evaluated is not a bar that passed."* This note does that and only
that. It is **offline**: it reads the committed capture `progress/records/guardcone1/` and the
committed source, renders nothing, launches nothing, and **re-scores nothing**. BH1 stays VOID and
the DO NOT SHIP verdict stands (§141.1). No fix to the bar is proposed here.

**Reproduce:** `node progress/records/bh1/bh1-farband.mjs` (passes `node --check`; every number below
is a line of its output).

---

## 1. The answer

`farS` is **`[-91461, 19759, 0]`** — a point 91,461 px to the left of the frame and 19,759 px below
it, on a 1280×720 image. It is not missing, not null, and not a coordinate the probe failed to
produce. It is the **perspective projection of a point that lies essentially in the camera's own
plane**, where the divide by `w` diverges. The guard's cone is thrown *back toward the lens* by the
shot's own staging, and its far tip stops **15 cm short** of the plane through the camera — so it
projects to a finite 94,254 px from the apex instead of to infinity outright.

BH1 splits near from far by projecting each ROI pixel onto the screen-space axis `apexS → farS` and
normalising by that axis's own length (`guardcone-score.mjs:92-99`). That axis is **94,254 px** long.
The frame diagonal is 1,469 px. So the entire ROI compresses into `t ∈ [−7.2e−4, +8.8e−3]`, the far
bucket needs `t ≥ 0.5`, and nothing reaches it.

**None of the ROI is lost.** The loop visits **517,896 pixels** — 56% of the frame. 516,057 of them
land in `near`. Zero land in `far`.

---

## 2. Which of the four candidate explanations

**It is 4 — something else**, and each of the other three is wrong in a way worth stating, because
each would send a successor somewhere different.

| # | as offered | verdict |
|---|---|---|
| 1 | `farS` lands off-frame, so the sampling loop collects nothing | **Half right, wrong mechanism.** `farS` *is* off-frame. But the loop is not around `farS` — it walks `subj.beamRect ∩ frame` minus the subject bbox (`guardcone-score.mjs:87-104`) and collects **517,896 px**. `farS` never bounds the walk; it only sets the axis the walk's pixels are projected onto. |
| 2 | `farS` is in-frame and the far band's own predicate excludes everything there | **Wrong on both halves.** `farS` is not in-frame. And the band's only predicate is `S ≥ 0.05`, which rejects **1,839 of 517,896 px = 0.36%** — and rejects them from *near*, not far. **0 px reach the `t ≥ 0.5` test regardless of saturation.** |
| 3 | `farS` comes from a probe that returned nothing, so the coordinate is degenerate | **Right word, wrong cause.** The probe returned a value for every one of the 11 guards in this frame. The coordinate is degenerate, but from a **near-zero perspective divide**, not from a missing probe result. |
| 4 | something else | **This.** `farS` is a *correct* projection of a point the projection cannot represent. The bar consumes it as an ordinary screen coordinate and never asks whether it is one. |

---

## 3. VERIFIED — the pixel accounting, from `guard.bon.png` itself

Re-running BH1's own two functions instrumented reproduces `RESULT-guardcone` §2's line exactly:

```
reproduced      near hue=17.8 S=0.453 (516057px)  far hue=n/a S=n/a (0px)
§2 recorded     near hue=17.8 S=0.453 (516057px)  far hue=n/a S=n/a (0px)
```

Every condition, counted rather than inferred:

```
beamRect [0,0,770,720] clamped to frame           554400 px
  minus subject bbox [698,198,1045,705]           -36504 px
PIXELS THE LOOP VISITS                            517896      (56.2% of the frame)
  dropped by S < 0.05                               1839      (0.36%)
  survive the saturation gate                     516057
    -> near bucket (t < 0.5)                      516057      (100.0%)
    -> far  bucket (t >= 0.5)                          0
visited px with t >= 0.5 REGARDLESS of saturation      0
```

BH1's own verdict branch is `(acc.near.n > 400 && acc.far.n > 400) ? … : null`
(`guardcone-score.mjs:133`). `near` clears the 400 px minimum by 1,290×; `far` misses it by all of
it; the bar returns `null` and `tools/gate.mjs` renders that VOID. The VOID is arithmetically
correct and the scorer behaved exactly as written.

## 4. VERIFIED — the far bucket was unreachable for *any* picture

This is the part that matters, and it does not depend on what is in the frame.

`t = (p − apex)·(far − apex) / |far − apex|²`, so for any pixel `p`,
`|t| ≤ |p − apex| / |far − apex|`.

```
furthest any pixel on a 1280x720 frame can be from apexS (770,335):   860.4 px
therefore t <= 0.009129 everywhere, for every possible image
far bucket needs t >= 0.5, so it is reachable ONLY IF |far-apex| <= 1721 px
measured |far-apex| = 94254 px                                        54.8x over that ceiling
```

The `t = 0.5` boundary is a line perpendicular to the axis; on scanline `y = 360` it sits at
**x = −47,386**. The whole frame is on the near side of it, by about 47,000 px.

**So BH1 did not look at the far half of this beam and dislike it. It could not look at all.** No
arrangement of pixels in `guard.bon.png` — none — could have produced a non-empty far band once
`farS` had that value. The near/far *comparison* the bar exists to make had no second operand.

## 5. VERIFIED — where `farS` comes from, and the check it skips

`guardcone.mjs:340-341` writes the two endpoints straight out of the projector:

```js
apexS = proj(ax[0], ax[1], ax[2]).map((v) => Math.round(v));
farS  = proj(ax[0] + zc[0], ax[1] + zc[1], ax[2] + zc[2]).map((v) => Math.round(v));
```

`proj` returns `[screenX, screenY, ndcZ]`. A few lines earlier, the *same* probe function builds
every rect through `rectOf`, which drops out-of-frustum samples explicitly
(`guardcone.mjs:306-313`):

```js
if (!(z > -1 && z < 1)) continue;                // behind/past the frustum planes
```

So the probe author knew the projector emits garbage for points near or behind the camera, and
guarded the rects against it. `apexS`/`farS` are written **without that guard**, and the third
component survives in the manifest as the tell:

```
apexS [770, 335, 1]          ndcZ 1  — an ordinary in-frustum depth
farS  [-91461, 19759, 0]     ndcZ 0  — a depth no ordinary scene point has
```

`guardcone-score.mjs` never reads index `[2]`. BH1's precondition is
`if (bonIm && subj?.beamRect && subj?.apexS && subj?.farS)` (`:109`) — a **truthiness** test, and an
array of nonsense is truthy. This is also why `beamRect` is sane (`[0,0,770,720]`, built by
`rectOf`, frustum-filtered) while `farS`, from the same frame and the same guard, is not.

**What ndcZ = 0 means numerically.** The stored value is rounded, so the true ndcZ was in
`[−0.5, 0.5)`. For this camera (`PerspectiveCamera(38, 16/9, 0.1, 4000)`, `Engine.js:80` +
`Shots.js:544`), `ndcZ = 1.00005 − 0.20001/d` where `d` is metres along the view axis:

```
ndcZ = -0.5  ->  d = 0.1333 m
ndcZ = +0.5  ->  d = 0.4000 m
```

**The beam's far tip sits 0.13–0.40 m along the camera's view axis** — inside the camera, past the
0.1 m near plane by a hair. `apexS`'s ndcZ of 1 rounds from `d ≥ 0.40 m` and is unremarkable.

## 6. INFERRED — the world-space geometry that put it there

Reconstructed offline from committed source. The camera model is **verified**; the beam tip is
**inferred**, with the residual stated.

**Camera — verified.** `PerspectiveCamera(38°, 1280/720, 0.1, 4000)` at `(-13.25, 2.6, 30.5)` looking
at `(-18.75, 1.1, 28.0)` (`Shots.js:442-452`). Projecting the eight corners of the subject's probe
box reproduces the recorded bbox to one pixel: `[699,198,1045,705]` vs recorded `[698,198,1045,705]`.

**Apex — the naive reconstruction fails, and that is expected.** `proj(pos + eyeHeight)` gives
`[861,305]` against a recorded `[770,335]`, because `_eyePosition` (`Guard.js:1204-1211`) takes the
eye off the **live head bone** plus `coneEyeFwd 0.45 / coneEyeUp 0.08`, and only falls back to
`pos + eyeHeight` when there is no bone. A skinned bone in a frozen `look_around` pose cannot be
reproduced from source. Recovering the eye from the camera ray through `apexS` instead puts it at
`(-17.46, 1.505, 27.90)`, passing within **0.42 m** of the guard's own vertical axis — it is his head,
located to ~20 cm.

**Heading — verified twice, independently.**

```
from the recorded `ahead` disc [407,705]:        (-0.067, 0, 0.998)   residual 1.30 px
from SHOT_POSE.guard's own formula:              (-0.069, 0, 0.998)
agreement                                         0.0019
```

The second derivation is the causal one. `SHOT_POSE.guard` (`Guard.js:193-201`) carries
`towardCamera: 0.35, screenSide: -1`, with the comment *"Aim him so the beam rakes across the frame
instead of down the barrel: side-on to the lens, tipped this far back toward the viewer"*, and
`_solveShotPose` (`Guard.js:2240-2256`) implements exactly `side·right·√(1−t²) − t·camForward`. **The
subject guard is aimed at the lens on purpose**, and the beam follows his facing.

**Tip.** The beam axis is that heading pitched `conePitch 0.115` rad down and thrown `reach` metres
(`Guard.js:1977`). Depth along the view axis is then linear in reach:

```
d(reach) = 5.030 - 0.3115 x reach     [metres]

  reach   tip world (x,y,z)            d(axis)   projected farS         ndcZ
   8.25   ( -18.01,  0.56,  36.08)      2.460    (  -2355,    995)      0.919
  12.00   ( -18.26,  0.13,  39.79)      1.292    (  -7883,   2162)      0.845
  15.00   ( -18.46, -0.22,  42.77)      0.358    ( -38298,   8582)      0.441
  16.15   (the camera plane)            0.000    ( +/-inf, +/-inf)      -inf
```

The authored cone is `VISION.temple.coneLength = 15.0 m`, floored at `15.0 × coneMinThrow 0.55 =
8.25 m`. **The beam axis reaches the camera plane at 16.15 m — 1.15 m past the longest cone the
guard can throw.** At 15 m the tip is already inside a metre of it and projects tens of frame-widths
off screen.

Reconstructed `farS` at 15 m is `(-38298, 8582)` against the recorded `(-91461, 19759)`. **The ratio
is 2.388 in x and 2.302 in y — the same factor in both axes to 3.6%**, which is the signature of two
points on one camera ray at different depths, not of a wrong direction. Backing that scale out gives
an implied **d = 0.150 m**, landing inside the 0.133–0.400 m band that §5 derived independently from
`ndcZ` rounding to 0. The residual is ~0.2 m of eye position, which is the head-bone placement the
recovery above could not pin; near the camera plane the screen coordinate goes as `1/d`, so 20 cm of
world error is a factor of two on screen.

**Third route, no ray recovery at all.** `_solveShotPose` places its candidate at `cam + dir·d` and
then drops it to the ground, so for a `y = 0` floor the stand's axis depth is `0.9419 d + 0.6266`.
The guard's *recorded* root sits **5.341 m** down the lens axis, which inverts to **d = 5.00 m** — a
grid rung exactly, the second one. Putting the eye at `root + coneEyeFwd 0.45` along the verified
heading then predicts the tip depth at a 15 m throw with no free parameter but head height:

```
  y_e      eye axis depth     d(15 m)      d implied by the recorded farS
  1.400        4.850           0.178                 0.150
  1.505        4.824           0.152                 0.150
  1.600        4.801           0.129                 0.150
```

Three independent routes — `ndcZ` rounding, the `1/d` scale factor between reconstructed and
recorded `farS`, and the stand grid — all put the tip **~0.15 m in front of the camera plane at an
unclipped 15 m throw**.

## 7. Is this a property of THIS shot, or of the bar?

**Both, in different senses, and a successor needs both halves.**

**The trigger is this staging.** Census over all 49 rows and all 539 guard entries carrying a `farS`:

```
farS off the 1280x720 frame                                    267  (49.5%)
farS with rounded ndcZ != 1 (rectOf would have dropped it)       4
```

Those four are `guard.off`, `guard.bon`, `guard.blamp`, `guard.back` — **one guard, in one shot,
identical across all four arms**. Off-frame `farS` is routine and mostly harmless: `hero`'s subject
reads `[1470,578,1]` and `traversal`'s `[1602,1013,1]` — ordinary in-frustum points that merely
project past the viewport edge, leaving an axis of a few hundred px and a well-posed split. Only
`guard` has the `1/d` blow-up. The *other* in-frame guard in the very same frame (index 1) reads
`apexS [726,284,1] → farS [1211,277,1]`, an axis of 485 px with both ends in the frustum.

**But the bar's exposure to it is total, not partial.** BH1 scores exactly one row — `bonIm` and
`subj` are hardwired to `row('guard','bon')` at `guardcone-score.mjs:61-64` — and the subject within
that row is fixed at index 0 by `SHOT_POSE.guard` (`Guard.js:193-201, 2144, 2162`). So the one
staging BH1 can ever see is the staging that deliberately turns the cone toward the lens, and the
margin between "projects to a usable axis" and "projects to 94,254 px" is 1.15 m of cone length out
of 16.15. BH1 has no alternative shot to fall back on and no test that would notice.

**And it is not a knife-edge coincidence of one draw.** `_solveShotPose` picks the stand by stepping
`d` — *distance along the camera's forward axis*, `Guard.js:2199-2202` — from `spec.minDist 4.5` to
`spec.maxDist 17` in 0.5 m increments. At the shipped 15 m cone the tip crosses the camera plane
whenever the eye's axis depth drops below `15 × 0.3115 = 4.67 m`. §6 showed the chosen rung was
`d = 5.00`, putting the eye at 4.82 m — **one grid step above the crossing, with 15 cm of clearance**.
The grid's first rung, `d = 4.5`, puts the eye at ~4.35 m and throws the tip *behind* the camera
plane instead: opposite sign of `w`, `farS` mirrored to the other side of the screen, and the same
unusable axis. The staging and the cone length do not leave room for a well-posed axis at either
rung.

Stated plainly, because that is what a successor needs: **as sealed, BH1 is structurally unable to
evaluate the only shot it is pointed at.** It is not a bar that this candidate failed, and not a bar
that this candidate would have passed with a better cone — its near/far axis is defined by a
quantity that, in this shot, the projection cannot represent. §348's classification of VOID rather
than FAIL is exactly right, and the reason is now on the record.

## 8. NOT CLAIMED

- **No remedy.** Nothing here proposes a change to BH1, to the probe, to `SHOT_POSE.guard`, or to any
  threshold, and nothing here re-scores anything. §141.1: the bar was sealed before a frame existed,
  and a bar that looks wrong once the data is in is not a bar this note gets to move. A successor
  that wants a near/far falloff bar seals a new one, in a new file, with its own registered
  predicate — and it now knows the failure mode to write against.
- **Nothing about whether the cone's falloff is actually right.** BH1 exists to ask whether the far
  half of the beam is more saturated than the near half. That question is **untouched** by this note.
  It was untouched by the capture too. I did not measure it and I am not implying an answer.
- **Nothing about the other four failing bars.** BS1, PROT-MOON, PROT-LAMPS and PROT-B_sly-startle
  are outside this note. In particular, BS1's apex probe and BH1's far endpoint come from adjacent
  lines of the same function, and I have **not** checked whether that is a shared cause —
  RESULT-guardcone §6's ADDENDUM already diagnosed BS1 on luminance, and I have not re-examined it.
  What §5 above establishes is only that `apexS`'s own `ndcZ` is 1, i.e. the apex endpoint is not
  degenerate the way the far endpoint is.
- **The exact world position of the beam tip.** §6's reconstruction pins the mechanism, not the
  metre. The head bone's contribution to `apexS` is ~20 cm I cannot reproduce offline, and near the
  camera plane that is a factor of two on screen. Verified: the camera, the heading, the depth band
  from `ndcZ`. Inferred: the tip coordinates and the 15 m reach.
- **That `reach` was exactly 15.0 m in this frame.** Three routes triangulate it (§6) and it is what
  an unobstructed throw would give, but `Senses.updateReach` clips per frame against collision and
  **no readback of `g.reach` was captured** — so it is inferred, not read. The mechanism does not
  depend on it: every reach from 12 m up already puts `farS` thousands of pixels off-frame, and even
  the 8.25 m floor gives an axis of ~3,200 px, still above §4's 1,721 px reachability ceiling.
- **That the stand repeats across boots.** All four `guard` arms carry byte-identical probes, so it
  is fixed *within* this boot, and §7's grid argument says a nearby stand is no better. But
  `_solveShotPose` re-runs its ground-check and line-of-sight search every boot, and I have not
  established that it lands the same rung every time. One boot, four rows.
- **That this generalises to other captures.** The census covers `guardcone1/` only.
