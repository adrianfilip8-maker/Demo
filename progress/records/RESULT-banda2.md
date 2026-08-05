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

### Chunk N (night) — LANDED, scored: **P7-fw = 0 PASS. The collision guarantee held.**

Boot 18:34:02, srcTree `3be168ae28832f69` before AND after (STABLE). Settle 421 s.
**P-F7 ok: live nightAmount = 1 exactly.** Arms base / ABg / restore; per-arm readback:
ABg poked subjW **0.50** (the gate's night output = the pin) + tintPeak 0.62, and
`uShadowColor` read **≡ base bit-equal** on every arm (0.012896, 0.046769, 0.078053) — the
L2 cap-dead proof live, again. Scored at first wake (§163.2):
**night ABg-vs-base differing px frame-wide = 0** (off-subject 0, in-subject 0) against
band [0,0]; P-F4 night restore = 0. The predecessor's 2,130-px failure (63 off-box guard +
2,067 in-box Sly) is measured GONE under the gate — the §3 arithmetic (pin ⇒ uniform
bit-equal; L2 capped-dead; boot determinism) predicted exactly this and the frame delivered
exactly this.

**§122.3 null-hazard check (a 0-px pass must not be an empty frame):** banda2's
`night.base` vs banda1's committed `night.base` cross-boot differs by **0.27 %** of pixels
(guard patrol phase + per-boot variation — two independent boots of the same staging), and
the subject crop shows Sly in `sneak_walk` inside the box with the warm doorway glow behind
him. The frame is the diagnosed night staging; the zero is a result, not an absence.

### Chunk A (sly-closeup) — LANDED, scored: all rows PASS

Boot 18:43:56 (own lock hold, released after). Settle 379 s. **P-F7 ok: nightAmount = 0
exactly.** ABg `uShadowColor` moved **×1.0740** per channel vs base — the port predicted
×1.0736 (kUsed 3.37/3.139 at tod 0.80), agreement to 4e-4, reproducing banda1. A and
KBoverwarm left `uShadowColor` bit-equal (subjW does not touch `_refreshShadowColor` ✓).
Scores: BaseGates −20 / +27 in-band; P1 (A and ABg) −45 / +13; P2 +0.30 / +0.46;
**P-F5 arch invariance 0 px**; **KB-overwarm rings −20 < +5 — reads as its own failure**;
P-F4 restore 0 px.

### Chunk B1 (hero) — LANDED, scored: all rows PASS; KB anchor reproduced to the digit

Boot 18:53:56. Settle 407 s. **P-F7 ok: 0 exactly.** B/ABg `uShadowColor` **×1.0808**
(predicted ×1.0800 at kAsked 3.39). KBwarmmud's uniform signature ×[1.6538, 0.9630, 0.8585]
— the warm-mud asymmetry, correctly NOT the candidate's uniform scale. Scores: BaseGate
<L40 37.62 ∈ [30,46]; P3 −2.43 (B and ABg) in band; P5 221.33; **KB-warmmud hero satP50
0.323→0.281, rel drop 13.0 % — fires at the recalibrated ≥10 % line, identical to the banda1
anchor**; W2 −0.11 pp and W3 +0.01 pp in their gated bands; P-F4 restore 0 px.

**Partial-scoring note (expected, resolves when B2 lands):** the `KB-warmmud rects fired`
tally row reads 1/3 = FAIL at this point because only hero's KB rect exists yet — interior's
two rects (banda1 anchors 23.2/26.6 %) are in chunk B2, currently queued FIFO behind another
owner's capture (pid 2028; the runner released the lock between chunks as designed). The row
is meaningful only at full scoring.

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
