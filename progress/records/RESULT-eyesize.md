# RESULT-eyesize — the PREREG-eyesize capture, scored per the seal

**Owner:** CHARACTER. **Status: IN PROGRESS — this file is updated incrementally as arms land
(durable-early under an observed ~5–9 min snapshot/restore cadence; §11 of this file logs it).**
Seal: `PREREG-eyesize.md` (committed 6e33f00). Driver: `eyesize-capture.mjs`. Scorer:
`eyesize-score.py` (committed before scoring; one implementation correction §10). Run record:
`eyesize/eyesize-arms.json` + frames in `eyesize/frames/`.

## 1. Provenance

- HEAD at run start **`13512a2`**, src clean; pre-edit six-dir srcTree (ls-files basis)
  `1368435ab38aaded`; **edited capture tree `4df7983d8cc7d715`** — all arms boot from it
  (the token is default-off, so base arms build float-identical geometry: ×1.0 identity).
- **Basis note (§121.4):** the seal's registration hash `820ace395b9664ae` is the FIND-basis
  digest (`find src -name '*.js'`) of the SAME bytes — `git diff a052771..13512a2 -- src/` is
  empty; no src change landed between registration and run. Two instruments, two digests, one
  tree.
- The token edit was applied ONLY inside the held `tools/lock.mjs` ticket (7 sites, asserted
  exactly-once), and reverts to byte-identity against a pre-run snapshot on every exit path.
  Wiring was verified offline before launch: token-built geometry matches the projection
  transform to 8e-8 m; 1,172 of 1,178 treated verts move (the 6 unmoved are on-axis poles with
  zero in-plane component — arithmetic).

## 2. GATE 0 + in-hold offline instruments (from the run log / arms.json)

- **GATE 0 occlude, `sly-closeup`:** centre rays **BOTH CLEAR** under base, `eyesize55`, and
  `eyebead15`. Pass.
- **headratio:** base **5.03**, `eyesize55` **5.03** — unchanged to 2 decimals (GATE 5 leg).

## 3. Arm A (base) — measured, with one declared anchor deviation

Frame `frames/sly-closeup-A.png` (this timeline's sha `230d5b2a617829fc`, draws 265;
combat sha `962df9ee0e8b1172`, draws 224; arm walltime 668 s under load).

Anchor patches reproduce the committed CHAR-sbs1 registration to the decimal: inter-eye
divider **L 37.6 vs 37.6**, cheek **98.2 vs 98.2**, muzzle **108.7 vs 108.7**; divider runs
**13/12 px vs 13 ± 4**; screenR aperture eye:face **0.316 vs 0.301 ± 0.03**; whole-frame
diff vs the sbs1 frame is only 9,585 px. **Bill ink-boundary −17.5 px** — exactly §166's
post-`capYaw` B-arm figure, and ≥ −19.0, so the standing guard holds on A.

**Declared deviation (scoreability sub-check):** screenL aperture reads **0.265** against the
anchored 0.324 ± 0.03. Attribution, measured not argued: the anchor was frozen on the
pre-`capYaw` `8640769` frame; the §166 ship (bill yawed −10° toward HIS RIGHT = the screenL
eye's side) landed between the anchor frame and this run and re-shades that eye's outboard
edge (the outboard strip brightened L 53.0 → 64.5 while every non-bill anchor reproduced).
Handling per the seal's own rule ("re-registration against the actual frame, never a silent
threshold change"): the A-anchor for screenL is **re-registered at the measured 0.265** with
this paragraph as the record; **no gate band moves** — GATE 1 is absolute [0.10, 0.18],
GATE 2/3 absolute, GATE 4 is relative to THIS run's A by registration. The re-anchored
frame-side prediction for B/screenL becomes 0.265 × (31/71) ≈ **0.116** (was 0.135), still
centred in GATE 1's band.

A remains 1.8–2.6× canon on eye:face (0.265/0.316 vs 0.10–0.15) — the defect the candidate
targets is present in the control, as required.

## 4. Arm B (`eyesize55`) — PENDING

## 5. Arm KB (`eyebead15`, known-bad) — PENDING

## 6. Arm BACK (base re-run) — PENDING

## 7. Gate verdicts — PENDING (scored per seal §6 the moment frames exist)

## 8. Combat leg — PENDING

## 9. Verdict — PENDING

## 10. Scorer correction, recorded at the site (§16-family)

The scorer's first aperture implementation took the bbox of ALL L>120 px inside the padded
ROI; on arm A it caught brow-highlight pixels outside the disc, inflated eye:face to
0.39/0.36 and dragged the centroid row off the divider (run read 1 px) — while the underlying
anchor patches reproduced to the decimal. The instrument was wrong, not the frame: corrected
to the seal's meaning of "aperture" — the 4-connected pale component nearest the eye centre —
with the same L>120 threshold and the same ROI rule (A on exact committed rects; B/KB on A's
measured bbox + 6). Recorded here because a number that moved 0.324→0.39 with no pixel cause
is the §16 shape: a measurement passing/failing on what the instrument does, not what the
frame does.

## 11. The rollback environment this ran under (operational record)

Full-VM checkpoint/restore is active: filesystem AND process state AND clock rewind together
to a rolling snapshot (~5 min cadence observed; restores observed at first-timeline ~11:07
and ~11:15 during this run — two restores inside 12 minutes, against the ~45-min planning
figure). Consequences observed and designed around:
- The capture process itself rewinds and RE-EXECUTES from the snapshot point (arm A was
  captured three times across timelines with differing shas — §28's world-clock effect across
  re-executions; the within-timeline BACK≡A byte gate is the control that catches any
  mixed-timeline frame set).
- Files ratchet forward only via snapshots; anything written after the latest snapshot dies
  at the next restore. Hence: frames + records re-verified after each restore, scoring run
  the moment each artefact exists, and this text file re-written whenever a restore reverts
  it — the scored numbers live in the run record and this file, which the coordinator's sweep
  makes durable.

## 12. Files this task wrote (sweep list — no git run by this task)

- `progress/records/RESULT-eyesize.md` (this file)
- `progress/records/eyesize-capture.mjs` (driver, v2: argv arm selection + base-only recovery
  mode)
- `progress/records/eyesize-score.py` (scorer, with §10's recorded correction)
- `progress/records/eyesize/eyesize-arms.json`, `progress/records/eyesize/score.json`
- `progress/records/eyesize/frames/*.png` (arms as they land)
- Scratchpad only: capture log + pidfile, working crops.
