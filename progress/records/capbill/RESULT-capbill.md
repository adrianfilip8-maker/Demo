# RESULT-capbill — the A/B/BACK frame verdict on the registered −10° cap yaw

**Owner:** CHARACTER (fresh spawn, briefed from committed files only per §163.1). **Date:** 2026-08-05.
**Seal:** `progress/records/PREREG-capbill.md` — every threshold below is that file's, unchanged.
**Registered candidate:** `capYaw = −0.175 rad (−10°)` as `CHAR_AB('capyaw10')` token arm at
`SlyModel.js:2540` (the one-line site, §1 of the prereg). Decision basis: `CHAR-sbs1.md` §6/§D —
−10° reaches base-45°'s read level inside the plateau, projection verified at srcTree
`3fea650a4d645857`.

**Status: IN PROGRESS — this file is written incrementally (§163 rollback discipline: durable
early, not at the end).** Sections are appended as they complete; an interrupted run leaves this
file stating exactly what landed.

## 0. Tree state at start

- srcTree (prereg recipe, `find src -name '*.js' | sort | xargs sha256sum | sha256sum`, repo
  root): **`3fea650a4d645857`** — **bit-identical to the prereg's registration tree**, so the
  prereg §5 projection table and CHAR-sbs1 §6 are measurements of this exact tree. No re-derivation
  of rows is needed.
- `src/player/SlyModel.js` pre-edit sha256: `9d411b84929440600910da5019b3af150bbc2123413bc7bfb98423450ffc0bb7`.
- Edit site verified unique: the shipped two-line `tilt` statement at `SlyModel.js:2540-2541`.
- Capture lock queue at check: empty (no tickets, no `capture.lock`).

## 1. GATE 0 — occlude.mjs under the token, run BEFORE any ticket (PASS)

Per the brief's ordering (GATE 0 before planting any ticket) and the hard rule (src/** touched
only inside a held ticket), GATE 0 ran on a **shadow copy** of the tree in the scratchpad:
`src/` copied verbatim (shadow srcTree `3fea650a4d645857`, identical), `tools/occlude.mjs`
copied unmodified, `node_modules` symlinked, and the registered one-line token edit applied to
the COPY only. The shipped tree was not touched. Token injected via
`globalThis.__CHAR_AB='capyaw10'` wrapper (the same mechanism `CHAR_AB()` reads at
`SlyModel.js:67`). A second in-ticket run on the real edited tree is recorded in §3 below before
any frame is spent.

**Reading of "both sclera rays CLEAR", stated before use:** the registered contract is
`SlyModel.js:2672-2678` — the brim-over-eye defect was cap material (`clothDark`/`capBrim`) hit
by a ray from each sclera toward the **`sly-closeup`** camera; "both rays" = both eyes.
`combat`'s base state already carries posed-head capBrim hits on eyeR (`cane_combo_3` head pose,
shipped), so no candidate including the null can print six CLEAR lines there; the binding GATE 0
site is `sly-closeup`, with combat recorded base-vs-token for regression of the CLEAR set.

Results (full outputs in `gate0-occlude.txt` beside this file):

| shot | ray | base | token capyaw10 |
|---|---|---|---|
| sly-closeup | eyeL centre / white+x | CLEAR / CLEAR | CLEAR / CLEAR |
| sly-closeup | eyeL white+y | ink@0.005m[pupilL] (own-eye ink, mm-scale self-hit) | identical |
| sly-closeup | eyeR centre / white+x | CLEAR / CLEAR | CLEAR / CLEAR |
| sly-closeup | eyeR white+y | ink@0.006m[pupilR] (self-hit) | identical |
| combat | eyeL centre / white+x | CLEAR / CLEAR | CLEAR / CLEAR (unchanged) |
| combat | eyeL white+y | occluded (capBrim@0.022m) | occluded (clothDark@0.009m) — was already occluded |
| combat | eyeR all three | occluded (capBrim 0.16–0.18m) | occluded (capBrim 0.16–0.18m) |

- **sly-closeup under the token: output line-for-line identical to base. Both eyes' sclera rays
  CLEAR. GATE 0 PASS.**
- combat: the CLEAR set {eyeL centre, eyeL white+x} is exactly preserved; no ray that was CLEAR
  in base became occluded under the token. Informational, no regression.
- Positive control that the token reached the build: the combat hit distances *moved*
  (0.177→0.184, 0.181→0.166 m etc.) — the cap demonstrably yawed in the shadow build; the
  closeup identity is therefore "the yawed cap still does not cross the sightlines", not "the
  token did nothing".

**The capture is authorized to queue.**

## 2. Scorer built and validated BEFORE the frames (capbill-score.mjs, committed with the run)

Per the seal ("a records scorer implementing exactly this definition, to be committed with the
run before scoring"), `progress/records/capbill-score.mjs` implements E and all gates verbatim;
its header states every choice the seal left to the scorer. Validation, all pre-frame:

- **Synthetic selftest (known-good and known-bad, §141.1):** straight edge E=0, slanted edge
  E=0.4, 12 px bump on straight edge E=12, on slanted edge E=12.4 — all inside ±1. The FIRST
  version failed the slanted-edge control at E=1.1 (median-anchor staircase quantisation); fixed
  with subpixel luma-crossing refinement + trimmed-mean anchors. The control caught a real
  instrument defect before any frame was read.
- **Projection mapping (dry run):** px/m at the head 294.3 (closeup) / 175.1 (combat) against
  the prereg's fov-and-distance 289.6 / 168.3 — the perspective mapping reproduces the
  registered scale. Skinned vertex positions verified BIT-IDENTICAL to `capbill-proj.mjs`'s
  (same probe verts through both pipelines, 5 decimals).
- **Registered rows derived from the bill CONTRIBUTION** (pixels present with brim drawn that
  vanish without it — capbill-proj's own definition, rasterised at capture perspective), union
  of base ∪ yawR10, padded ±25: closeup rows 102..146 (scan 77..171), combat rows 411..433
  (scan 386..458), outboard LEFT at both. The first draft used raw brim-vert row extents; the
  dry run caught the brim's occluded wrap rows reaching the crown apex at closeup (no crown
  band would remain) and the contribution definition replaced it.
- **Offline-vs-runtime pose delta, found and understood:** overlaying the projection on the
  committed same-tree `sbs1/sly-closeup.png` frame registers face/ears/body well, but the cap
  sits ~10-30 px up-left in the real frame vs the offline basis. Cause read from
  `Animation.js:447-456`: even under `freezePose` the runtime applies `lookAtLayer`,
  `springLayer`, `tailLayer` and `_footIK` on top of the sampled clip — exactly the layers the
  projector's inherited header disclaims, and exactly what the seal's ±25 px pad exists for.
  The padded row bands bracket the real brim band (~115-150 at closeup) with room.

### 2.1 Scoreability preview on the committed same-tree frames (recorded for honesty, converts nothing)

Measured on `progress/records/sbs1/{sly-closeup,combat}.png` (same shot, same srcTree, same
tod as the capture will stage — the registered check itself runs on the capture's own arm A):

- closeup strip (x531..570, rows 102..146): median luma **80.5**, share>120 **1.1%** — the
  backdrop at the bill rows is a wall, not sky.
- combat strip (x469..508, rows 411..433): median luma 232.1, share>120 **88.0%** — bright,
  but 12% of strip px are dark (min 29.7).

The scorer's pre-stated reading of "must be sky" is strict (every strip px luma > 120 — written
into the committed scorer BEFORE this preview). On these numbers the registered E-gates will
return **UNSCOREABLE at both shots** on the capture too. That is the seal's registered outcome:
*"UNSCOREABLE, registered as such; the fallback is a re-registration against whatever backdrop
the frame actually has, not a silent threshold change"* (§7). The capture still runs as sealed:
GATE 3 (BACK ≡ A validity), GATE 4 (collateral confinement + headratio), and the A↔B in-frame
pixel evidence are scoreable regardless of backdrop, and the frames are the record the
coordinator's re-registration would score against.

## 3. Capture run

(Filled in as the run proceeds — launched detached via `tools/launch.sh`, log at
`progress/records/capbill/capbill-run.log`, provenance at `capbill.json`, frames landing
directly in `progress/records/capbill/frames/`.)

## Files this task writes (sweep list, updated as they appear)

- `progress/records/capbill/RESULT-capbill.md` (this file)
- `progress/records/capbill/gate0-occlude.txt` (GATE 0 raw outputs)
- `progress/records/capbill.mjs` (run harness — tuftbias.mjs pattern per §159.3)
- `progress/records/capbill-score.mjs` (the registered-definition scorer, committed before scoring)
- `progress/records/capbill/capbill.json` (per-arm provenance, written incrementally by the harness)
- `progress/records/capbill/capbill-run.log` (detached run log)
- `progress/records/capbill/frames/*.png` (6 frames, copied to this durable path per capture)
- `progress/records/capbill/capbill-score-out.json` (scorer output)
- `progress/records/capbill/occlude-inticket.txt` (in-ticket GATE 0 re-run + headratio, §3)
- Scratchpad only (never committed): `gate0/` shadow tree, wrapper, calibration outputs.

No git commands are run by this task; the coordinator sweeps.
