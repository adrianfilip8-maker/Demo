# Catchlight (cap6 guard, right eye L121.9): no fix is sealed, and here is why

Requested as a third seal for the post-freeze window. **I am not sealing a fix, because the cause
in the routing cannot produce the symptom**, and the capture already queued settles it for free.

## The routed mechanism is symmetric; the defect is not

cap6's guard: catchlight max **L198.8 left (pass ≥180)**, **L121.9 right (fail)**. Routed as
"the glint rides the same bone and constricted with the pupil. Owner CHARACTER."

The glint does ride the pupil bone — `SlyModel.js:1813`, `weights: [[pupilBone, 1]]`, deliberately
and with a comment explaining why. That part is true. But the constriction driving it is
**identical on both eyes**:

```
Clips.js:2140   sc: { … pupilL: [0.35, 0.35, 1], pupilR: [0.35, 0.35, 1] }
Clips.js:2146   sc: { … pupilL: [0.35, 0.35, 1], pupilR: [0.35, 0.35, 1] }
```

A symmetric cause cannot produce an asymmetric result. Whatever makes the right eye read 77 L
darker than the left, it is not the pupil scale — the scale would have to take both eyes down
together.

This is §23's shape exactly: a term that is present, firing, and provably *able* to produce the
signature, and still not the cause. It is worth naming that the mechanism was confirmed in pixels
by cap6 ("at 6× the pupils are pinpricks in wide eye discs") — that observation is real and is
about the *pupils*, and it was then carried across to the *glint asymmetry*, which is a different
measurement.

## What the asymmetry actually is

`node tools/eyefacing.mjs`, current tree:

```
sly-startle   L   dot(out,toCam) 0.963   47.6 px
sly-startle   R   dot(out,toCam) 0.684   33.8 px
```

The right eye is **~47° off-axis** against the left's ~16°, and 34 px against 48 px. A glint is a
small specular ellipsoid offset from the pupil centre along `outward`/`trueUp`/`right`; at 47° it
is foreshortened, partly self-occluded by the pupil and lid, and takes the key at a different
incidence. `sly-closeup` carries the same asymmetry (0.903 / 0.652).

So a single ≥180 bar was applied to two eyes that the frame does not present equally. **The guard
did its job** — it fired on a real difference on its first exposure — but "right eye < 180" is not
yet evidence of a defect in the eye. It may be evidence of a defect in the framing, or of a
correct dimming that no threshold should have been set against.

## The test costs nothing extra, and it is already queued

The pupil calibration frame — `sly-startle` with the pupil `sc:` keys neutralised, which §27.2
established is the missing minuend and cannot be manufactured — is the *same frame* that settles
this, because it is the constricted/unconstricted contrast at fixed pose, fixed camera, fixed sun:

- **calibration right-eye glint ≈ L120 (± the frame's own noise):** the constriction is not the
  cause. The right eye is dim because of view angle and/or cap-brim shadow, the ≥180 bar is
  mis-set for that eye, and the fix is framing (below) — **not** geometry. Any glint change shipped
  now would have been a fix for nothing, tuned against a number it could move.
- **calibration right-eye glint ≈ L200 while the verdict frame is L122:** the constriction *is*
  the cause on that eye, and the fix is to decouple the glint's scale from the pupil bone —
  concretely, `weights: [['head', 0.5], [pupilBone, 0.5]]`, which takes the glint to ~0.67 scale
  at 0.35 constriction instead of 0.35, preserving the design intent ("stays a catchlight on black
  rather than becoming the eye") while keeping it above the read floor. That is a one-line change
  with a stated prediction, and it should be sealed **then**, against a real baseline.

Sealing the geometry change now would spend the freeze on a coin-flip and would contaminate the
calibration frame besides — see the ordering below.

## Ordering, which matters more than it looks

The pupil metric is a **difference** (ΔdarkFrac = calibration − verdict). A difference is only
clean if everything except the pupil keys is constant between the two frames. So:

1. Land the tree changes that are sealed (`heroline` cane aim, `tailcone`) **and no eye change**.
2. **Capture A** — one boot: `hero` + `sly-closeup` + `sly-startle`. Gives the heroline verdict,
   the tailcone verdict, and the pupil **verdict** frame (keys active).
3. Neutralise the pupil `sc:` keys **only**, nothing else. **Capture B** — `sly-startle` alone.
   That is the minuend, on a tree that differs from A by exactly one variable.
4. ΔdarkFrac = B − A, and the right-eye glint comparison above falls out of the same pair.

If an eye change lands between A and B, both the pupil verdict and this attribution are spent and
a third capture is needed. cap6 cannot serve as A: it predates the sealed changes.

## `sly-startle` framing — the request, with numbers

The coordinator asked for the framing I actually want rather than an adjective. Measured with
`progress/records/startleframe.mjs` (sweep of camera azimuth × elevation × distance about the
staged head; the tool's stated gap: **facing and projected size only — no lighting, no
self-occlusion, no level occlusion**).

Current: `pos [-1.6, 1.45, 33.2]`, `target [0.0, 0.95, 30.0]`, `fov 38` → worse eye **0.684 / 34 px**.

**Requested:**

```
'sly-startle': {
  pos: [-2.21, 1.60, 31.78], target: [-0.08, 1.11, 30.03], fov: 22, tod: 0.80,
  player: { pos: [0, 0, 30], yaw: 5.24, pose: 'hurt' },
}
```

That is the lens rotated **−25° around him**, up 10°, in to 2.8 m, aimed at the **head centre**
(−0.08, 1.11, 30.03) rather than at the chest. Predicted:

| | left eye | right eye | worse |
|---|---|---|---|
| current | 0.963 / 47.6 px | 0.684 / 33.8 px | 0.684 |
| requested | 0.907 / 98 px | **0.920 / 102 px** | **0.907** |

The two eyes come within 0.013 dot of each other, so a single catchlight bar becomes a fair test
instead of one applied to a 47°-off-axis eye, and the failing eye gets **3× its pixels**.

**Control, so the gain is not attributed to the zoom:** the same distance and fov at the *current*
bearing (az 0) leaves the right eye at **0.685 / 68 px**. The azimuth is the lever; the zoom only
adds pixels.

Two things I could not settle and am not claiming:

- **Player yaw is unchanged at 5.24, deliberately.** It is the only lever on face *lighting*
  (KNOWN_ISSUES §7: face lighting is a function of yaw and the sun alone), and moving it would
  break the property this shot exists for — "`sly-closeup`'s staging verbatim, one variable".
  If the eyes are under the cap brim's shadow, no camera fixes that and I would rather the record
  say so than have a yaw change smuggled in under a framing request.
- **Whether the brim shadows the eyes at `tod 0.80` at all** — my instrument cannot see lighting,
  and I have not measured it. cap6's prose says it does. If the coordinator wants that settled
  before the calibration capture, it is a `tools/occlude.mjs` question plus a sun vector, not a
  capture.

Landing this framing before the calibration capture is what was offered and it is what I want:
both frames of the difference must share it.
