# SPEC — startled pupils (task #19 prep; no src touched; implementation post-freeze)

## What startle does (mechanism)

**Geometry only. No emissive change** — the pupil lives in the `ink` material group shared
with the mask and lids; a pupil-only emissive needs a new material group = a new draw call,
and the character budget (12; body spends 9 + cane + outline) has no room. Declined with
that reason, not deferred.

Mechanism: two new bones `pupilL`/`pupilR`, children of `head`, positioned at each pupil
centre `pc` (SlyModel `_buildEye`: c + outward·0.020S + trueUp·0.013S). The pupil ellipsoid
AND its glint ellipsoid re-weight from `[['head',1]]` to `[[pupilX,1]]`. At rest the bones
are identity → **bit-identical skinning in every existing pose** (regression gate below).
Clips drive constriction through the EXISTING scale path (`sc:` keys — already proven in
`hurt`'s chest squash; `PoseBuffer.addScale`, Rig applies `pb.s`). Scale is in the bone's
local frame; the pupil flattens along its own view axis already, so uniform (s,s,1) reads
as a smaller disc. The glint rides the same bone: at 0.35 pupil scale a full-size glint
would cover the disc, so the glint shares the constriction and stays a catchlight on black.

## Authored values, per clip (binding list)

- `hurt` (dur 0.62, hold 0.1): key t=0 `sc: { pupilL:[0.35,0.35,1], pupilR:[0.35,0.35,1] }`
  ease snap (with the existing snap key), held through t=0.16, recover to 1.0 at t=0.42
  (ease out). The hold frame (0.1) is inside the constricted window, so any frozen capture
  of `hurt` shows the startle.
- `ko` (dur 1.3, hold 0.9): constrict 0.45 from t=0, recover only half (0.72) by the
  settle key — dazed, not alert.
- Non-binding candidates for a later pass (listed so they are a decision, not scope creep):
  `spire_land` first 20%, `wall_cling` entry, guard-detection reaction (needs an Animation
  hook, out of scope here).

§4.7 compliance: zero clip names added/removed/renamed; two bones added to the rig table +
`boneNames` (SlyModel l.702 order list) — `PoseBuffer(sly.boneNames)` picks them up; clips
without pupil tracks leave the bones at identity by the existing `clear()` path.

## Verification

Needs one shot def freezing `hurt`: request to coordinator (Shots.js is read-only for me):
`sly-startle` = sly-closeup camera/player verbatim, `pose: 'hurt'`. (The hurt hold puts the
head up and toward camera — head visibility to be charvis-checked when the def lands.)

Two-stage seal, stated now so the §26 lessons bind:
1. **Calibration capture** (freeze-safe once the def exists; BEFORE the pupil change):
   sly-startle + sly-closeup, one boot. Instrument: interiorink `--eyes` boxes (25×26 as
   frozen for cap5) recomputed for the hurt pose; metric per eye:
   `darkFrac` = fraction of box px with L < 60, and `glintMax` = box max L.
   The calibration numbers freeze the bands.
2. **Verdict capture** (after implementation): same pair, same boot.

Provisional bands, TO BE FROZEN at calibration with real numbers (marked provisional
exactly so no one quotes them as sealed — §26.2):
- per-eye ΔdarkFrac (calibration − verdict, startle frame): PASS ≥ 0.12 · IMPROVED
  [0.05, 0.12) · FAIL (−∞, 0.05). Partitions ℝ (§26.1).
- Guards: glintMax ≥ L180 both eyes (catchlight survives); sly-closeup (idle) eye stats
  byte-stable vs its own calibration frame (the rest-identity regression — the whole point
  of the bone mechanism); both regressions route as "mechanism leaked", revert.
- Offline regression before any capture: CPU-skin diff of all 52 hold frames current-vs-
  changed tree = zero moved vertices outside the two pupil/glint vertex ranges (`shotsil`
  machinery; the ranges get published like `tuftRanges`).

Cost: +2 bones, 0 draw calls, 0 tris, 0 new materials.
