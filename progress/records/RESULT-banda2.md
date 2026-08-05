# RESULT-banda2 — registered scoring of the banda2 capture (PREREG-banda2.md)

Scored by SHADING, 2026-08-05, per `PREREG-banda2.md` **exactly as sealed** — bands quoted
verbatim from the seal via the registered scorer (`banda-diag.mjs score2`, committed BEFORE
the capture; its BANDS2 table duplicates the seal's §4 and a mismatch voids the scoring, not
the seal). **Written incrementally as chunks land (§163/§164); an abrupt end means a rollback
took the session, not that scoring stopped.**

**STATUS: IN PROGRESS — capture running.**

## Evidence and provenance (filled per chunk as it lands)

- Inherited obligations discharged before sealing: night leak localized and traced
  (`banda2-nightleak.md` — the `rooftop_run` guard through the vSlySkin/uSubjWarmShade path;
  L2 eliminated by banda1's own bit-identical night readback), KB-warmmud recalibrated from
  banda1's frames (`banda-diag.mjs cal2`: anchors 13.0/23.2/26.6 % vs candidate −1.2…+1.9 %;
  threshold ≥10 % on ≥2 of 3 rects).
- Candidate: L1 subjW 0.65 + L2 tintPeak 0.62 + **G the night gate**
  (`uSubjWarmShade = lerp(TUNE.subjWarmShade, subjWarmShadeNightPin 0.50, nightAmount)`
  published at the setKeyLight nightAmount consumer, ToonMaterial.js:1280–1287). Capture
  emulates G exactly per shot (nightAmount ∈ {0,1} exactly on canonical shots — P-F7 reads it
  live per shot via `shading._inkNight`).
- Scorer smoke test (calibration property, run before capture): `score2` on the
  PREDECESSOR's banda1 frames scores the ungated AB arm **P7-fw FAIL at 2,130 px** with every
  other row PASS — the successor metric sees exactly the failure the gate must remove.
- Runner: `progress/records/banda2.mjs` (committed; chunk order N, A, B1, B2, D1, D2 — night
  first, the decider). Launched detached via `tools/launch.sh` (pid 11787 verified ppid 1);
  log `progress/records/logs/banda2.log`; pidfile in scratchpad.
- Src tree at launch: `3be168ae28832f69` (banda1 was `820ace395b9664ae`; the two intervening
  commits are registered look-inert at defaults — goldlobe `uGoldGlint 0.0` scaffold,
  fxcluster debug-gated seams; base gates arbitrate per P-F3).
- Frames + per-arm readback JSONs: `progress/records/banda2/` (flat `<shot>.<arm>.png`,
  `score2`'s layout; ABg = the gate-emulated joint arm).

## Chunk log

(filled as chunks land; per-chunk partial `score2` runs land here durably before the next
chunk is awaited)

## Scores

(the `score2` table lands here verbatim once chunks complete)

**Resume instructions if a rollback takes this session** (per §163/§164): sweep
`/tmp/sands-of-ra/queue` against /proc (§140.2), then relaunch
`bash tools/launch.sh /home/user/Demo/progress/records/banda2.mjs
/home/user/Demo/progress/records/logs/banda2-r2.log <scratchpad>/banda2.pid all` — the runner
is idempotent (chunks whose frames all exist are skipped). Score with
`node progress/records/banda-diag.mjs score2 progress/records/banda2`; bands are in the
scorer and the seal, verbatim.

## Verdict

Pending. Per the seal: PASS requires every gated band in-band on ABg (and A/B where scoped),
both KB arms reading as their own failures, P-F3–P-F7 clean, and **P7-fw = 0 px frame-wide at
night** (P-F6: without the night proof the candidate does not ship regardless). Ship decision
is the coordinator's; the ship diff is the seal's §2 src shape exactly.
