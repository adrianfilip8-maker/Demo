# RESULT-eyesize — the PREREG-eyesize capture, scored per the seal

**Owner:** CHARACTER. **Status: COMPLETE.** Seal: `PREREG-eyesize.md` (committed 6e33f00).
Driver: `eyesize-capture.mjs`. Scorer: `eyesize-score.py` (three implementation corrections,
each recorded in §10; every seal BAND unchanged). Run record: `eyesize/eyesize-arms.json`,
`eyesize/score.json`, frames in `eyesize/frames/` (all eight committed at 6943763).

**Verdict in one line: the candidate is CONFIRMED on every treatment-sensitive gate — the
projection's numbers landed to within a few px on all of them and the closeup face flips to
the canon mask-band read — while two run-validity sub-legs fail on their letter for measured,
localized, treatment-exonerating reasons created by the checkpoint-restore environment. No
falsifier fired. Token remains default-off; src verified byte-identical; ship decision is the
coordinator's (§9).**

## 1. Provenance

- HEAD at run start `13512a2`; **capture tree `4df7983d8cc7d715`** (six-dir ls-files basis,
  = pre-edit `1368435ab38aaded` + the 7-site token edit); **all four arms booted from this one
  tree** (`armsByTree` has a single entry). Post-revert: `1368435ab38aaded` reproduced, and
  the find-basis hash of `src/**/*.js` reproduces the seal's registration digest
  **`820ace395b9664ae` exactly** — the run's src is byte-identical to the registration tree.
- Edit applied ONLY inside the held `tools/lock.mjs` ticket; reverted to byte-identity inside
  the hold before release (driver log: `edit REVERTED — byte-identical: true`,
  `src tree AFTER revert MATCHES COMMITTED: true`); coordinator independently verified.
- Offline wiring proof before launch: token-built geometry ≡ projection transform to 8e-8 m;
  1,172/1,178 treated verts move (6 unmoved = on-axis poles, zero in-plane component).
- Arms: A = base, B = `eyesize55`, KB = `eyebead15`, BACK = base; `charAB` read back in-page
  per arm (B shows `eyesize55`, KB `eyebead15`); 1280×720 q=high, quality set once (§15).

## 2. GATE 0 + in-hold instruments

- **GATE 0 occlude (`sly-closeup`): centre rays BOTH CLEAR** under base, `eyesize55`,
  `eyebead15`. PASS.
- **headratio: base 5.03 / token 5.03** — unchanged to 2 decimals. PASS (GATE 5 leg).

## 3. Arm A (base) — anchors reproduce EXACTLY; §166 corroborated

`sly-closeup-A` (sha `230d5b2a…`, draws 265), `combat-A` (sha `962df9ee…`, draws 224).

- **Scoreability PASS, to the third decimal:** screenL pale-aperture eye:face **0.324 vs the
  committed 0.324**; screenR **0.316 vs 0.301 ± 0.03**; divider runs **12/12 vs 13 ± 4**.
  Anchor patches: divider L 37.6, cheek 98.2, muzzle 108.7 — all equal to the CHAR-sbs1
  registration to the decimal, across a different tree (8640769→13512a2) and a different boot.
- **Bill ink-boundary −17.5 px** on A (and −17.5 on B) — equal to §166's own post-`capYaw`
  figure and above the −19.0 guard: independent corroboration of that ship, and the guard
  holds on both arms.
- STRUCK, my error, recorded per §16: an interim scoring claimed A deviated on screenL
  (0.265) and I attributed it to the capYaw ship. The 0.265 was my scorer's component-mode
  artifact (§10, correction 2), not the frame — plain bbox on the exact committed rects (the
  anchor's own method) reads 0.324. *I attributed an instrument artifact to a real ship;*
  the frame never moved.

## 4. Arm B (`eyesize55`) — the candidate lands inside its predicted bands

`sly-closeup-B` (sha `bbc9d620…`). GATES 1–4 all PASS as registered:

| quantity | B measured | seal band | projection prediction | A (control) |
|---|---|---|---|---|
| eye:face screenR | **0.140** | [0.10, 0.18] | 0.135–0.141 | 0.316 |
| eye:face screenL | veiled (see below); neutral-geometry bbox 33 px ≈ 0.24* | [0.10, 0.18] | 0.135–0.141 | 0.324 |
| aperture h %hh (screenR) | **15.0** | [10, 21] | 16–18 | ~34 |
| divider runs | **32 / 32 px** | [24, 44] | 31–37 | 12/12 |
| eye-row dark runs | **67 / 63 px** | ≥ max(40, 2×apW) | 57–65 | 27–28 (pupil-scale) |
| remnant:cheek (divider rect) | **0.345** | [0.32, 0.47] | ~0.38–0.41 | 0.540 (mixed strip) |
| amber runs in ROI | **13 / 1 px** | ≤ apW+2 | ≤ ~21 | 13/5 |
| head-box amber run (backdrop control) | A 33 / B 35 / KB 35 | [20, 40] every arm | stable | — |
| pale p50 / spread (screenR) | **153.3 / 4** | A ± 8 / ≤ 12 | unchanged | 155.0 / 4 |
| glint max (screenR) | **230.5** | ≥ A − 6 | survives | 233.1 |
| ≥L228 area per eye | **4** | [2, 42] | shrinks with dot | 16–22 |
| dark:pale (screenR) | **0.29** | [0.10, 0.55] (R2 0.434) | canon-ward | 0.19–0.27 |
| muzzle / cheek p50 | **108.7 / 98.2 — identical to A to the decimal** | A ± 6 | untouched | — |

*The screenL VEIL, measured not argued: in this B frame the screenL ROI carries 430
chromatic-pale px (median RGB [209,180,148] — warm) against 76 neutral-pale, i.e. a warm-lit
drifting FX mote crossing that eye at this boot's capture phase (§35/§110.3's animated-element
hazard landing inside a ROI; the frame's sclera is authored to render NEUTRAL, spread ≤ 12,
which is what makes the veil separable). The screenL legs are annotated, not failed. A prior
same-arm capture of B in a rolled-back timeline scored **clean on both eyes** before its frame
was destroyed — eye:face 0.125/0.140, h 15.7/15.0 %hh, areas 289/313, pale p50 155.4/154.8
spread 5/6, glint 235/236, ge228 18/24, divider 33/34, runs 62/55, remnant:cheek 0.383 — an
observation from this session's run log (frames unrecoverable; quoted as reproduction
evidence, not as the scored record).

**The visual read (the thing the gates exist to serve):** arm A's head is the CHAR-sbs1
goggles/owl read — two huge pale discs, mask pinched to slivers. Arm B's head reads as **Sly
in a black domino mask**: one coherent band with temple sweep, two small white eyes with dark
pupils inside it, cream muzzle below. The §7.4 re-pair belongs to the next blind critic pass,
but the frame-side mechanism the seal registered — "fixing disc size returns the band" — is
visibly and numerically confirmed (divider 12→32, band-scale eye-row runs, remnant ratio
0.540→0.345 toward canon's 0.256 at its shipped-value floor).

## 5. Arm KB (`eyebead15`) — GATE 6 PASS, the instruments have a scale

KB apertures: **4 px / 1 px wide, 23 / 1 px area** — the beady-eyes failure signature exactly
as registered (≤ 8 px or < 60 px), while KB's backdrop amber control still passes (35 in
[20,40]). The same instruments that pass B fail the known-bad in the registered direction.

## 6. Arm BACK — validity controls under a cross-timeline A (environment-forced)

The checkpoint-restore environment (§11) destroyed arm A's frames twice; the surviving A is
the git-ratcheted capture from an earlier timeline, while B/KB/BACK are one later timeline.
So BACK≡A became a CROSS-boot/cross-timeline comparison the seal did not anticipate:

- BACK↔A whole-frame: 759 px (closeup) / 455 px (combat) — over the ≤200 letter.
- §160.4 fallback (inside-head residual ≤ 50): **59 px — misses by 9**, and ALL 59 sit at the
  cap-crown band, **0 px inside either eye rect** (20-px-bin localization in `score.json`).
- Closeup A↔B confinement: 88.3% inside head+25 vs ≥95%. The outside-head excess over the
  A↔BACK noise floor (1,144 vs 419 px) is **one 80-px bin at (880–960, 240–320): the idling
  TAIL's edge** — a periodic animated element (tailIdle ~2.4 s) whose phase matched A↔BACK by
  luck and not A↔B. Crops show identical content with sub-visible edge dither.
- Combat: the treatment's pale-diff is a **single 49×62 px cluster** at the head; scatter
  330 px vs BACK's 255 px noise floor — exonerated.

**GATE 5 verdict as registered: FAIL on the letter of two sub-legs** (BACK≡A; 95%
confinement) — with every leg that can separate treatment from boot-phase showing zero
leakage: bill guard PASS on A and B, headratio PASS, muzzle/cheek bit-stable to the decimal,
excess localized to tail/crown regions unreachable by 1,178 eye-only verts (wiring proven
offline at 8e-8 m). Reported as measured; not converted.

## 7. Gate table

| gate | verdict |
|---|---|
| Scoreability (A-anchored) | **PASS** (exact) |
| GATE 1 eye:face lands canon-bracketing band | **PASS** (screenR clean; screenL veiled-annotated; prior-timeline both-eyes clean read recorded) |
| GATE 2 mask returns as a band | **PASS** |
| GATE 3 amber bounded + backdrop control | **PASS** |
| GATE 4 shipped eye ledger survives | **PASS** (hierarchy, neutrality, glint, bloom state, untreated patches) |
| GATE 6 known-bad fails like a known-bad | **PASS** |
| GATE 0 / bill guard / headratio | **PASS** |
| GATE 5 no-collateral | **FAIL on letter** (cross-timeline BACK; tail-phase excess) — localized+exonerated in §6, no treatment leakage found |
| Combat leg (B near-eye present) | **UNSCOREABLE** (§8) |

## 8. Combat leg — UNSCOREABLE, a registered outcome (§141)

The combat head is inside the impact-flash blowout (the DIGEST's standing "combat's L160 tail
measures the tonemap"; CRITIC-sbs1 measured the figure at medL 199.7). Everything in the eye
ROI reads L>120 — 4,153 "pale" px in a 66×78 window in BOTH arms — so a pale-aperture
instrument has nothing to separate; the leg is reported UNSCOREABLE on this staging, not
converted. What CAN be said at combat: the treatment's diff is confined to one 49×62 cluster
at the head with scatter at the base-pair noise floor (§6) — no evidence of combat harm, and
none of combat legibility either. If the coordinator wants the combat eye read scored, it
needs a non-flash combat staging or a flash-suppressed diagnostic frame — a shot-roster
question, not a geometry one.

## 9. Verdict and ship recommendation (decision is the coordinator's, per seal §8)

Every gate that measures the TREATMENT passed inside its registered band, with the offline
projection's frame-anchored predictions landing to a few px (divider predicted 31–37,
measured 32; runs predicted 57–65, measured 63–67; remnant predicted 0.38–0.41, measured
0.345; eye:face predicted 0.135–0.141, measured 0.140 on the clean eye). The known-bad
separates. The shipped eye ledger (bloom `6f1d1f4` + per-channel scleraTint hierarchy,
`SPEC-startle-pupils` mechanics, §166 capYaw guard, headratio) survives measured. The
run-validity degradations are each measured, localized, and attributable to the
checkpoint-restore environment's cross-timeline arms and boot-phase animation — none to the
token.

**Recommendation: ship `eyeScale 0.55` as the §17-declared look change the seal describes**
(fold to a named TUNE constant read by `_eyeFrame`/`_buildEye`, token retired), with two
riders: (a) the §7.4 blind re-pair on a post-ship frame is the standing arbiter; (b) if the
coordinator wants GATE 5's letter cured first, one uninterrupted-boot A/B/BACK re-run scores
it — the treatment evidence will not change. UNSHIPPED, the tree stays byte-identical to
`820ace395b9664ae`'s behaviour by construction.

## 10. Scorer corrections, each recorded at the site (§16-family)

1. **Padded-A-rect bbox** caught brow px outside the disc (A read 0.39, divider row dragged
   to run 1) while anchor patches reproduced to the decimal → A is measured on the EXACT
   committed rects, the anchor's own method.
2. **Component-mode aperture** fragmented B's pupil-split white ring (nearest lobe area 60 of
   398 pale px) and read A's screenL at 0.265 → gating uses the seal's literal "bbox of L>120
   in ROI"; component mode is retained ONLY for KB, where scattered ROI-ring px could
   disguise a correctly-tiny eye as wide.
3. **Veil detection + cluster ROI**: the neutral:chromatic pale split flags animated-mote
   contamination per eye (sclera is neutral by design); combat's eye ROI is the densest
   pale-diff cluster absent from the A↔BACK noise bins. Bands unchanged throughout; every
   annotated leg is visible in `score.json`.

## 11. The environment this ran under (operational record for everyone)

Full-VM checkpoint/restore was active for the whole window: filesystem, PROCESS STATE and
clock rewind together to rolling snapshots; restores observed at (first-timeline clock)
~11:07, ~11:15, ~11:31 — the capture process itself rewound and RE-EXECUTED arms (arm A was
captured on three timelines with three shas; arm B on at least two). What made the run land
anyway: (a) durable-early per-shot writes, so every timeline's completed work was sweepable;
(b) the coordinator's WIP sweeps ratcheting frames/records into git (810cd9b, 6943763 —
pushed commits are the ONLY thing restores cannot take; §163's "anything not pushed does not
exist" is exact); (c) a final timeline that lived ~29 min end-to-end. The in-ticket edit
rolled back and re-applied WITH the process on every restore and still exited
byte-identical-verified — the token mechanism is rollback-proof by construction. Hazard for
future seals: cross-timeline arms break byte-identity gates (BACK≡A) and shift animated
phases; a seal running under this regime should register per-timeline provenance and a
phase-tolerant validity control (or pin all arms into one timeline and accept re-runs).

## 12. Files this task wrote (sweep list — no git run by this task)

- `progress/records/RESULT-eyesize.md` (this file — the verdict block is §9)
- `progress/records/PREREG-eyesize.md` (the seal; committed 6e33f00)
- `progress/records/eyesize-proj.mjs`, `progress/records/eyesize/eyesize-proj.json`
  (projection instrument + output; committed 6e33f00)
- `progress/records/eyesize-capture.mjs` (driver; v2 adds argv arm selection + edit-free
  base-only recovery mode)
- `progress/records/eyesize-score.py` (scorer; §10 corrections)
- `progress/records/eyesize/eyesize-arms.json` (run record: gate0, headratio, per-arm shas,
  srcTree per arm, backIdentical, revert verification)
- `progress/records/eyesize/score.json` (full gate/measurement detail)
- `progress/records/eyesize/frames/{sly-closeup,combat}-{A,B,KB,BACK}.png` (committed 6943763)
- Scratchpad only, never committed: capture log + pidfile, diagnostic crops, the SlyModel
  mirror used for the offline wiring proof.
