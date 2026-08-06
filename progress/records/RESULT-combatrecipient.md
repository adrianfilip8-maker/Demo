# RESULT-combatrecipient — status

**Seal:** `PREREG-combatrecipient.md`. **Owner:** GUARDS. **Tree at seal:** `c8d8957`,
`src/ai/Guard.js` sha256 `350dece5a1b13fb7…`.

> **This file is written incrementally and is the record of what actually landed.** The container
> rolls back roughly every 45 minutes (§163) and a resumed agent reads its transcript, not the repo
> (§143.3), so state goes here as it happens rather than at the end. Anything below marked
> **PENDING** has not been measured.

---

## Status

| item | state |
|---|---|
| `PREREG-combatrecipient.md` | **SEALED** — mechanism (file/line/old→new), gated predictions, known-bads, falsifiers, §17 declaration, chunked plan, operator card |
| `combatrecipient.mjs` (capture harness) | **written, syntax-checked**; its screen projector cross-validated against an independent Python implementation to the decimal on all seven cameras |
| `combatrecipient-arms.py` (arm builder) | **written and verified**: four arms build, all parse under `node --check`, all revert to base **byte-exactly**; `cand` and `kbside` differ in exactly one token (the `screenSide` sign) |
| `combatrecipient-score.py` (scorer) | **written, calibrated 9/9** against CRITIC-sbs3's published `combat` statistics, and **dry-run end-to-end on synthetic frames** so it cannot crash on the real ones |
| chunk 1 `base` | **QUEUED** — launched via `tools/launch.sh` (pid verified detached at ppid 1), holding FIFO ticket `1785989642785-5947`, behind `litwarm1.mjs` and `sparkcount.mjs` |
| chunks 2–5 | **PENDING** — not started; `src/**` is untouched and at base |
| `src/ai/Guard.js` | **BASE, unmodified.** `combatrecipient-arms.py check` → `matches arm: ['restore']` |

**No `src/**` edit has been made.** The four arm variants exist only as a generator; nothing is
installed until the lock is held, and `revert` runs before release.

---

## Findings already on the record (all pre-capture, all from source + committed frames)

These are settled and do not depend on any capture landing.

1. **STAGING's diagnosis reproduces exactly, independently re-derived.** The impact anchor
   (0.3146, 1.3849, 28.9963), its projection at px (451.9, 432.6) d 4.906, the 0.890 m it sits
   *nearer the lens* than Sly's chest, the d = 4.5 rejection at ndc −1.095, the winning
   d = 5.0 stand (0.102, 0, 29.035), the 0.216 m anchor gap, and `screenSide −1`'s 2.038 m miss —
   every figure, from a projector validated sub-pixel against a number `Shots.js` published before
   either note existed.
2. **`spec.x` / `spec.z` / `spec.yaw` are dead fields — confirmed.** Only `index, look, clip, t,
   screenSide, minDist, maxDist, towardCamera` have readers. `Guard.js:150`'s documented COLLISION
   fallback does not exist, and `_poseForShot` discards `_solveShotPose`'s return value.
3. **The restore hazard is worse than "0.97 m from a spawn", and it is FIVE shots, not four.** A
   guard parked at the combat stand projects **into the viewport** of `sly-closeup`,
   `sly-startle`, `sly-perch`, `sly-arm` and `sly-profile` — every shot that stages the player at
   exactly (0, 0, 30). In `sly-profile` he is a **272 × 498 px body standing 1 m behind the
   character in a character sheet**, 14.7% of frame. `sly-key` (at (4, 0, 30)) is the safe one.
   Both the brief's "four" and STAGING's "sly-closeup, sly-profile and sly-key" are slightly off.
4. **The hazard is index-independent**, which is why this seal uses `index: 0` against STAGING's
   "not 0": the residue is a function of the *stand*, which `_solveShotPose` computes from the
   camera alone. Index 0 confines all staging mutation to the one roster member `SHOT_POSE`
   already touches.
5. **Today's `guard` stand leaves no residue**, so Edit 2 changes nothing that ships: (−15.49, 0,
   27.55) is off-frame left in `sly-profile` and behind the lens in `sly-key`, the only two shots
   that follow `guard`.
6. **A canonical full-set run would appear to self-heal, and that is an accident, not a fix.**
   `guard` (shot 13) restages roster #0 five shots after `combat` (shot 12) and moves him out of
   sight. Every *subset* run — which is what everyone actually runs — still carries the residue.
7. **`Shots.js`'s `guard` header's "d = 2.9 m" is a range, not an axial depth** (range 2.891,
   depth 2.715). Harmless; recorded so nobody spends a run on the 0.18 m.
8. **Two instrument defects caught in my own tools before they could score anything:** a
   corner-in-viewport test that called `sly-startle` safe *because* the residue fills its frame;
   and a launch-time source hash standing in for the tree the boot actually renders.

### Two pre-capture amendments to the seal, both recorded rather than silently swapped

- **§2.0 — the Sly colour mask is STRUCK.** On `sbs3/combat.png` the sunlit paving reads
  **medSat 0.579 at medL 134** against Sly's own torso at **0.394**, at the same hue: *the floor is
  more saturated than the character.* The sealed predicate returned 58,982 px in a box holding
  roughly ten thousand of him — §128.2's denominator hazard. P3 is re-registered on geometry
  (share of Sly's projected body box covered by the recipient's change component, ≤ 0.40) plus an
  absolute intrusion line (component right edge ≤ 560, Sly's centre being 576).
- **P-F8 — loosened, and the loosening is declared.** Its stated reason ("the registered rects are
  then not measuring the subject") was falsified by my own contingency arithmetic before any frame
  existed: at the plausible d = 5.5 fallback the rects still measure the subject. It is now a
  reported premise check (> 0.30 m) with WITHHELD only past 1.20 m. **It touches no band that
  decides SHIP.**

---

## Gate results

**PENDING** — no frame of this seal has been captured yet. Scoring happens at the first wake after
a chunk lands, before anything else (§163.2), by
`python3 /home/user/Demo/progress/records/combatrecipient-score.py`.

## Verdict

**PENDING.** Per the seal's degradation ladder (§5), chunks 1–2 alone give reported P1–P4 with
**no SHIP** (the `kbside` known-bad is unresolved); chunks 1–4 give a full verdict. **The ship
decision is the coordinator's**; this file will name file, line and old→new either way.

---

## Files (coordinator sweep list — no git run by this task)

- `/home/user/Demo/progress/records/PREREG-combatrecipient.md`
- `/home/user/Demo/progress/records/RESULT-combatrecipient.md` (this file)
- `/home/user/Demo/progress/records/combatrecipient.mjs`
- `/home/user/Demo/progress/records/combatrecipient-arms.py`
- `/home/user/Demo/progress/records/combatrecipient-score.py`
- `/home/user/Demo/progress/records/combatrecipient1/` (frames + telemetry; empty until chunk 1 lands)
