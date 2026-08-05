# RESULT-capbill — the A/B/BACK frame verdict on the registered −10° cap yaw

**Owner:** CHARACTER (fresh spawn, briefed from committed files only per §163.1). **Date:** 2026-08-05.
**Seal:** `progress/records/PREREG-capbill.md` — every threshold below is that file's, unchanged.
**Registered candidate:** `capYaw = −0.175 rad (−10°)` as `CHAR_AB('capyaw10')` token arm at
`SlyModel.js:2540` (the one-line site, §1 of the prereg). Decision basis: `CHAR-sbs1.md` §6/§D —
−10° reaches base-45°'s read level inside the plateau, projection verified at srcTree
`3fea650a4d645857`.

**Status: COMPLETE — capture ran 06:05–06:31Z in one lock hold, token reverted byte-identically,
scored at first wake. VERDICT: UNSCOREABLE (the seal's registered outcome) — §5.** Written
incrementally per §163 rollback discipline.

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

Launched detached via `tools/launch.sh` (pid 5064, ppid 1 verified), log at
`progress/records/capbill/capbill-run.log`, provenance at `capbill.json`, frames landing
directly in `progress/records/capbill/frames/` (§164.1 durability).

- **Tree at capture ≠ registration tree, and the delta is named:** between GATE 0 (§1) and the
  launch, other owners landed edits in `src/world/Props.js` and `src/fx/Particles.js`, moving
  srcTree `3fea650a4d645857` → `0ac0479e279468e3`. `src/player/SlyModel.js` pre-edit sha256 is
  byte-identical to §0's record, and `src/core/Shots.js` is untouched — **the model, poses,
  cameras and therefore the registered rows/tables are unaffected**; what may move is the
  scene backdrop (world/fx), which the scoreability check measures on the run's own arm A
  anyway. All three arms boot inside one lock hold on one tree, so BACK ≡ A is uncontaminated
  by the delta (§153.5's design).
- 06:02:58 lock HELD (FIFO, queue was empty). Settle gate: tree quiet 120 s at `0ac0479e`.
- 06:04:58 token edit APPLIED at SlyModel.js:2540 (srcTree → `086fd03ab4469745` for the hold).
- 06:05:01 **in-ticket GATE 0 re-run on the real edited tree: PASS** — closeup token output
  line-for-line identical to base, registered rays CLEAR (`occlude-inticket.txt`).
- 06:05:03 **headratio idle_confident: 5.03 → 5.03 under the token — unchanged to 2 dp**
  (GATE 4's skull-ratio clause holds; structural expectation confirmed — a pure yaw about the
  vertical head axis cannot change any y-measure).
- 06:05:03 vite up (SANDS_NO_HMR=1), born on the edited tree; arms A → B → BACK, each a fresh
  navigation with `__CHAR_AB` set via addInitScript ('' / 'capyaw10' / ''), two shots per arm.

## 4. The capture landed complete — six frames, one hold, byte-identical revert

| arm | token seen in page | sly-closeup sha16 / secs | combat sha16 / secs | srcAtArm |
|---|---|---|---|---|
| A | (none) | `8f0e77d4b2ebcfb6` / 272 | `0f5633cf7337da8f` / 188 | `086fd03ab4469745` |
| B | `capyaw10` | `a55123bf340afef4` / 216 | `6f19abc6e7168a5d` / 180 | `086fd03ab4469745` |
| BACK | (none) | `17e470c72e526734` / 214 | `98b6c9d2a96c535e` / 183 | `086fd03ab4469745` |

06:05–06:31Z, one lock hold, ~29 min total. All three arms navigated the SAME edited tree
(`sameTree` true — no mid-run edit landed; the settle gate + per-arm hashes did their job).
06:31:24 token REVERTED inside the hold, `SlyModel.js` sha256 byte-identical to §0's pre-edit
record, srcTree back to `0ac0479e279468e3`, `capYaw` absent from src, THEN the lock released.
The shipped build is byte-identical to its pre-run state.

## 5. VERDICT — scored by the sealed scorer at first wake after DONE (§163.2)

`capbill-score.mjs --score` output archived in `capbill-score-out.json`. Selftest re-passed at
scoring time. Registered order: scoreability first.

### 5.1 Scoreability (the seal's first check): **UNSCOREABLE at both shots — the registered outcome**

- `sly-closeup`: strip (x531..570, rows 102..146) **1780 of 1800 px non-sky**, min luma 25.3.
  The 40 px outboard of the projected bill region is a courtyard wall, not sky.
- `combat`: strip (x469..508, rows 411..433) **110 of 920 px non-sky**, min luma 29.7 — bright
  backdrop but not sky throughout, under the scorer's pre-stated strict reading (every px > 120,
  written before any frame or preview was measured).

Per the seal (§6, §7): **the E-gates (GATE 1/2) are UNSCOREABLE and are reported as such, not
converted. The registered fallback is a re-registration against the backdrop the frame actually
has — a coordinator decision — not a threshold change here.** E extraction attempts are archived
for completeness: closeup all-null (no sky at scan start, consistent); combat E(A)=53.6 /
E(B)=52.5 / E(BACK)=53.6 px with the cheek anchor landing on scene furniture (n7, 5 rows
dropped) — 53.6 sits outside its own [15,30] calibration band, i.e. the E instrument as
registered (sky-boundary) is not valid on this backdrop, which is exactly what the scoreability
check exists to catch (§141).

### 5.2 GATE 3 — validity: **FAIL as sealed, and the failure is measured, top-of-frame FX noise**

`sameTree` TRUE (all arms `086fd03a`). Whole-frame BACK↔A diff (ΣRGB ≥ 4): closeup **429 px**,
combat **271 px** — both above the sealed ≤ 200. Geography (diff px by 90-px row band, and ROI
membership):

- closeup A↔BACK: 429 px, rows 1–180 dominate (318+105); **75 px inside head bbox+25, 37 inside
  the bill ROI**.
- combat A↔BACK: 271 px, ALL in rows 3–174 (frame top); **0 px inside head bbox+25, 0 inside
  the bill ROI** — the combat head lives at rows 348–512.

This is cross-navigation nondeterminism in the top-of-frame FX bands (torch/haze family), not
character pixels. §110.3's cross-boot bit-identity finding was measured on a framing with
nothing animated; these two framings carry live FX, and this run measures their per-navigation
noise floor at ~270–430 px — above the seal's 200. **The gate fails as registered and is
reported failed;** for any re-registration, either the BACK threshold must be set from this
measured floor, or the pairs must ride one navigation.

### 5.3 GATE 4 — collateral: closeup 91.9% (≥90), combat **82.6% — FAIL as sealed**; headratio unchanged

- A↔B differing px: closeup 9739 (8948 inside head bbox+25 = 91.9%; 4330 inside the bill ROI);
  combat 4136 (3415 inside = 82.6%; 1628 inside the bill ROI).
- The combat out-of-bbox px sit in rows 0–180 — the same top-frame FX bands where the A↔BACK
  control shows its 271 px with **zero** in the head bbox — i.e. the miss is the nondeterminism
  floor sharing the diff, not cap leakage. Stated beside the number, not in place of it: the
  gate **fails as registered**.
- `headratio` 5.03 → 5.03 under the token (in-ticket, both ways) — the skull measure did not
  move; no vertex leakage. Structural expectation (a yaw about the vertical head axis cannot
  change a y-measure) confirmed.
- Treatment localization, treatment vs control: bill-ROI px 4330 vs 37 (closeup, 117×) and
  1628 vs 0 (combat). The token demonstrably reaches the frame at both bearings and is
  cap-localized.

### 5.4 Unofficial readback with a committed instrument (evidence for the re-registration, NOT a gate)

CHAR-sbs1 §5.3's bill-protrusion measure (`sbs1-measure.py`: leftmost ink boundary L<35, bill
rows 128..150 vs muzzle rows 200..236, x530..620 — backdrop-independent), applied verbatim:

| frame | bill-left med x | protrusion vs muzzle front |
|---|---|---|
| arm A | 574.0 | **−22.5 px = −16.1 %hh** — reproduces the committed §5.3 record TO THE DIGIT |
| arm B (−10°) | 569.0 | **−17.5 px = −12.5 %hh** — leading edge **+5.0 px (~1.7 cm) outboard** |
| arm BACK | 574.0 | −22.5 px — ≡ A to the digit on this measure |
| sbs1 frame (Aug-5 record) | — | −22.5 px re-measured, instrument stable across captures and the world/fx tree delta |

Direction and order consistent with the projection (§5's 1.6 → 4.1 cm is a max-run quantity,
not the leading-edge quantity, so numeric identity is not expected). R2 canon is +11.1 %hh:
−10° closes about a quarter of the gap at 33° on this measure.

### 5.5 The verdict line

**UNSCOREABLE — the seal's registered outcome, with GATE 3 and GATE 4 additionally failed as
sealed (both failures measured and attributed to the top-of-frame FX nondeterminism floor, not
to the treatment).** No gate was converted, no threshold moved, no value re-tuned mid-window
(the falsifiers' revert-not-defend applies: the token is already off and the tree byte-identical).
Outcomes A/B/C of the prereg's §8 are NOT reached — the frame did not rule on the yaw's
E-predictions because the E instrument's registered backdrop premise (sky at the bill rows)
is false at both shots at this tree. The registered fallback — **re-registration of the
in-frame quantity against the actual backdrop (the §5.4 ink-boundary family is the natural
candidate: it is committed, backdrop-independent, reproduces its record to the digit, and its
BACK ≡ A to the digit)** — and the ship decision are the COORDINATOR's. §151.4 stays open;
nothing here contradicts the projection's mechanism claim, and §5.4 is in-frame evidence the
mechanism reaches the graded render at 33° in the registered direction.

## 6. Tree state at finish

- srcTree `0ac0479e279468e3` (= capture base tree; registration tree `3fea650a4d645857` plus
  other owners' `src/world/Props.js` + `src/fx/Particles.js` edits — `src/player/**` and
  `src/core/Shots.js` byte-identical to registration throughout).
- `src/player/SlyModel.js` sha256 `9d411b84929440600910da5019b3af150bbc2123413bc7bfb98423450ffc0bb7`
  — byte-identical to §0's pre-edit record (its mtime is 06:31:24, the revert write; contents
  unchanged). `git diff` on `src/**` vs the pre-run state is empty of this task's work by
  construction (verified by content hash; this task ran no git).
- Post-run churn note for the sweep: `src/world/Props.js` moved again after 06:31 (another
  owner's ongoing work; srcTree now differs from the capture base). Scoring ran BEFORE that
  churn on the capture base tree, and the scorer's row derivation reads only
  `src/player/** + src/core/Shots.js`, which are registration-identical throughout — rows
  provenance is unaffected either way.

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
- `progress/records/capbill/capbill-rows.json` (registered rows/bands from the dry run)
- Scratchpad only (never committed): `gate0/` shadow tree + wrapper, `dbg/` projection-validation
  overlays and probes, `smoketest/` scorer-path test, `capbill-proj-rerun/`, `capbill.pid`.

No git commands are run by this task; the coordinator sweeps.
