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
