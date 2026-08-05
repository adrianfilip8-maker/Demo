# RESULT-banda2 — registered scoring of the banda2 capture (PREREG-banda2.md)

Scored by SHADING, 2026-08-05, per `PREREG-banda2.md` **exactly as sealed** — bands quoted
verbatim from the seal via the registered scorer (`banda-diag.mjs score2`, committed BEFORE
the capture; its BANDS2 table duplicates the seal's §4 and a mismatch voids the scoring, not
the seal). **Written incrementally as chunks land (§163/§164); an abrupt end means a rollback
took the session, not that scoring stopped.**

**STATUS: COMPLETE — all six chunks captured and scored. VERDICT: PASS, 38/38 in-band
(see the Verdict block). Ship decision is the coordinator's.**

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
is meaningful only at full scoring. **[Resolved below: 3/3 at full scoring.]**

### Chunk B2 (interior) — LANDED, scored: all rows PASS; both KB anchors reproduced

Queued ~27 min FIFO behind FX's b2rerun (pid 2028) with the ticket held cleanly, then boot;
settle 213 s. **P-F7 ok: nightAmount = 0 exactly.** B/ABg `uShadowColor` **×1.1923**
(predicted ×1.1927 — the one shot where the 0.62 cap still binds, kAsked 5.10). KBwarmmud
uniform ×[1.6169, 0.9662, 0.8655]. Scores: BaseGate wall medL 51.47/50.04 ∈ [44,58]; P4
+4.36/+4.37 (B and ABg) in band; P5 225.00; **KB-warmmud satP50 drops 23.2 % / 26.6 % — both
fire at ≥10 %, reproducing the banda1 anchors to the digit**; P-F4 restore 0 px.

### Chunks D1 (temple) + D2 (combat) — LANDED, scored: all rows PASS

Temple: P-F7 ok (0 exactly), ABg ×1.1340 (predicted ×1.1341), P5 body hue 207.00, P-F4 = 0.
Combat: P-F7 ok, ABg ×1.1066 (predicted ×1.1054, within kAsked print rounding), P8 warm%
ratio 1.00 ∈ [0.85, 1.15], P-F4 = 0. srcTree STABLE (`3be168ae28832f69`) before and after
every one of the six chunks. ALL DONE at 19:48:45 — total capture 74.7 min across six
separate lock holds (longest single hold ≈ 11 min, inside the rollback budget).

## Scores — full capture, quoted verbatim per the seal

```
banda-diag — drift guard PASS (47 constants + 13 load-bearing lines asserted against committed source)

═══ score2 — PREREG-banda2 quantities on progress/records/banda2 (BANDS2 verbatim from the seal) ═══
  P7-fw night Δpx (frame-wide)   0.00  band [0,0]  PASS
    (continuity split: off-subject 0, in-subject 0)
  P-F4 night restore px          0.00  band [0,0]  PASS
  BaseGate creamROI b−r          -20.00  band [-28,-12]  PASS
  BaseGate rings b−r             27.00  band [15,35]  PASS
  P-F5 arch invariance (A) px    0.00  band [0,0]  PASS
  P1 creamROI b−r (A)            -45.00  band [-58,-30]  PASS
  P1 rings b−r (A)               13.00  band [5,45]  PASS
  P2 tail body R−B (A)           0.30  band [-4,18]  PASS
  P1 creamROI b−r (ABg)          -45.00  band [-58,-30]  PASS
  P1 rings b−r (ABg)             13.00  band [5,45]  PASS
  P2 tail body R−B (ABg)         0.46  band [-4,18]  PASS
  KB-overwarm rings b−r          -20.00  band [-999,5]  PASS
  P-F4 sly-closeup restore px    0.00  band [0,0]  PASS
  BaseGate hero <L40 %           37.62  band [30,46]  PASS
  P3 hero.arch Δ<L40pp (B)       -2.43  band [-6,-0.5]  PASS
  P5 hero body hue (B)           221.33  band [200,246]  PASS
  P3 hero.arch Δ<L40pp (ABg)     -2.43  band [-6,-0.5]  PASS
  P5 hero body hue (ABg)         221.33  band [200,246]  PASS
  KB-warmmud hero body satP50 0.323→0.281 rel drop 13.0% (fires at ≥10%)
  P-F4 hero restore px           0.00  band [0,0]  PASS
  BaseGate int wall0 medL        51.47  band [44,58]  PASS
  BaseGate int wall1 medL        50.04  band [44,58]  PASS
  P4 int wall0 ΔmedL (B)         4.36  band [1,8]  PASS
  P4 int wall1 ΔmedL (B)         4.37  band [1,8]  PASS
  P5 interior body hue (B)       225.00  band [200,246]  PASS
  P5 interior body hue (B)       225.00  band [200,246]  PASS
  P4 int wall0 ΔmedL (ABg)       4.36  band [1,8]  PASS
  P4 int wall1 ΔmedL (ABg)       4.37  band [1,8]  PASS
  P5 interior body hue (ABg)     225.00  band [200,246]  PASS
  P5 interior body hue (ABg)     225.00  band [200,246]  PASS
  KB-warmmud interior body satP50 0.391→0.300 rel drop 23.2% (fires at ≥10%)
  KB-warmmud interior body satP50 0.430→0.316 rel drop 26.6% (fires at ≥10%)
  P-F4 interior restore px       0.00  band [0,0]  PASS
  P5 temple body hue (ABg)       207.00  band [200,246]  PASS
  P-F4 temple restore px         0.00  band [0,0]  PASS
  KB-warmmud rects fired         3.00  band [2,99]  PASS
  W1 interior frame warm% Δpp    -0.20  band [-0.5,2]  PASS
    (warmPct 7.31 → 7.11; ref interior frame warm% 31.0 (CRITIC-sbs2); the un-claimed remainder is routed, not scored)
  W2 hero arch warm% Δpp         -0.11  band [-0.5,2]  PASS
    (warmPct 9.13 → 9.01; ref interior frame warm% 31.0 (CRITIC-sbs2); the un-claimed remainder is routed, not scored)
  W3 hero beam litWarm% Δpp      0.01  band [-0.2,2]  PASS
    (litWarmPct 0.75 → 0.76; ref interior frame warm% 31.0 (CRITIC-sbs2); the un-claimed remainder is routed, not scored)
  P8 combat warm% ratio          1.00  band [0.85,1.15]  PASS
  P-F4 combat restore px         0.00  band [0,0]  PASS

  38 scored, 0 FAIL — RESULT-banda2 quotes this table verbatim.
```

Small honest drift, stated: interior base warm% reads 7.31 on this capture vs 7.52 on
banda1's frames (same rect, same predicate) — cross-boot/tree variation inside the base-gate
world; both W1 baselines are quoted beside their own deltas and the Δ band is what is gated.

**Resume instructions if a rollback takes this session** (per §163/§164): sweep
`/tmp/sands-of-ra/queue` against /proc (§140.2), then relaunch
`bash tools/launch.sh /home/user/Demo/progress/records/banda2.mjs
/home/user/Demo/progress/records/logs/banda2-r2.log <scratchpad>/banda2.pid all` — the runner
is idempotent (chunks whose frames all exist are skipped). Score with
`node progress/records/banda-diag.mjs score2 progress/records/banda2`; bands are in the
scorer and the seal, verbatim.

## Verdict — **PASS on every registered gate. 38 scored, 0 FAIL.**

**STATUS: COMPLETE. Scored per the seal, no deviations, no post-hoc changes.**

1. **The collision guarantee that killed the predecessor is now proven on pixels,
   frame-wide.** P7-fw = **0 differing px** (night ABg vs base, whole 1280×720 frame, ΣRGB ≥ 4)
   against band [0,0] — where the predecessor's ungated arm scored 2,130 on the same metric
   (smoke test, §Evidence). The zero is exactly what the seal's §3 arithmetic predicted from
   the localized mechanism (night pin ⇒ `uSubjWarmShade` bit-equal base; L2 cap-dead at night,
   re-proven live per arm; boot determinism), and §122.3 is discharged — the frame is the real
   night staging (0.27 % cross-boot diff vs banda1's committed frame; Sly visible in-box).
   P-F6 does not fire. The night look ships **unchanged by construction**.
2. **The day evidence reproduced on the current tree.** P1–P5 all in-band on every scoped arm,
   matching banda1's numbers almost digit-for-digit; P-F5 architecture invariance exact;
   uniform ratios matched the port to ≤ 1.2e-3 on all five day shots.
3. **The metric separates known-bads in both directions** (P-F2 clean): KB-overwarm rings −20
   (< +5, its own failure); KB-warmmud fires 3/3 wall rects at the frame-recalibrated ≥10 %
   line (13.0 / 23.2 / 26.6 % — the banda1 anchors reproduced to the digit), against candidate
   sat movement of −1.2…+1.9 %. Obligation (b) is discharged: the KB signature is now anchored
   to frames, not the 40–55 % port prediction the frame never delivered.
4. **The warm-share truth is registered, not hidden:** W1 −0.20 pp / W2 −0.11 pp / W3 +0.01 pp
   — all inside their gated must-not-regress bands, and all confirming what the seal's §1
   said out loud: **these levers do not move frame warm share.** Interior stands at 7.11–7.31 %
   vs the ref's 31.0 %. The ≈24 pp remainder is lit-area coverage — torch pool radius/energy
   (**FX**), enclosure (**LIGHTING**), staged night lights (**GEOMETRY**) — per the seal's §1
   routing and CRITIC-sbs2 §4.1. W1's instrument is the scale the next candidate calibrates
   against (§141.1).
5. Every P-F held: six chunks, six bit-identical restores (P-F4 = 0), P-F7 exact {0,1} on all
   six shots, base gates in-band (P-F3), src tree STABLE across the whole capture window.

**What a ship gets:** the declared §17 look change — daylight cast-shadow/enclosure registers
brighten ~2–5 display L (interior walls +4.4), the skinned population's shade register warms
(tail cream b−r −45, rings held +13) — with night bit-identical to today. **What a ship does
not get:** the CRITIC-sbs2 warm-share flip; that work is routed above and stays the top gap.

**Ship shape if the coordinator ships** (seal §2, exactly): `TUNE.subjWarmShade 0.50 → 0.65`,
`TUNE.shadowTintPeak 0.52 → 0.62`, new `TUNE.subjWarmShadeNightPin = 0.50`, and the one
publish line at the `setKeyLight` nightAmount consumer (ToonMaterial.js:1280–1287):
`u.uSubjWarmShade.value = lerp(TUNE.subjWarmShade, TUNE.subjWarmShadeNightPin, nightAmount)`
— plus a drift-guard assertion for the publish line in `banda-diag.mjs` and a KNOWN_ISSUES
entry quoting PREREG-banda2. The ship decision is the coordinator's.

## Files (coordinator sweep list — no git run by this task)

- `progress/records/banda2-nightleak.md` — obligation (a): the 63-px leak localized
  (rooftop_run guard) and traced at named lines.
- `progress/records/banda-diag.mjs` — extended (not forked) with `cal2` + `score2`.
- `progress/records/PREREG-banda2.md` — the successor seal.
- `progress/records/banda2.mjs` — the runner (gate emulation + P-F7 readback).
- `progress/records/banda2/` — 24 frames + 6 readback JSONs (chunks N/A/B1/B2/D1/D2).
- `progress/records/logs/banda2.log` — the capture log (launch.sh, pid 11787, ppid 1).
- `progress/records/RESULT-banda2.md` — this file.
- Scratchpad only (never committed): nightdiff.mjs, leak crops, n2-subject/ridge crops,
  score2-final.txt, banda2.pid.
