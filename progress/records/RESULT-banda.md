# RESULT-banda — registered scoring of the banda1 capture (PREREG-banda.md, sealed 87e5efd)

Scored by SHADING, 2026-08-05, per `PREREG-banda.md` **exactly as sealed** — bands quoted
verbatim from the seal via the registered scorer (`banda-diag.mjs score`, committed BEFORE
the capture; its BANDS table duplicates the seal's §4 and a mismatch voids the scoring, not
the seal). **This file is being written incrementally as chunks land (§163/§164 rollback
protection); an abrupt end means a rollback took the session, not that scoring stopped.**

**STATUS: IN PROGRESS — capture running.**

## Evidence and provenance (filled per chunk as it lands)

- Runner: `progress/records/banda1.mjs` (committed; §164 chunks, one boot per chunk, arms as
  live pokes with per-arm readback, idempotent resume). Launched detached via
  `tools/launch.sh` (pid verified ppid 1); log `progress/records/logs/banda1.log`.
- Frames + per-arm readback JSONs: `progress/records/banda1/` (flat `<shot>.<arm>.png`, the
  registered scorer's layout).
- Boot lever probe (chunk A): shipped TUNE = the seal's SHIP values exactly
  (subjW 0.50 / tintPeak 0.52 / sbm 0.05 / sbmLit 0.05) and live `uShadowColor`
  (0.09610, 0.31312, 0.49658) — the §132.3 anchor the offline port reproduces to 4e-4.
  The tree under capture is the tree diagnosed.
- src tree at chunk A: `820ace395b9664ae` (find-based convention, banda1.mjs header).

## Chunk log

### Chunk A, first attempt — **VOID by P-F4, as written; frames quarantined, rerun launched**

The first chunk A (boot 11:56:59, srcTree `820ace395b9664ae`, all five frames + readbacks
landed) scored **P1/P2/P-F5/KB-overwarm all PASS in-band** — creamROI b−r **−45** (arm A;
creamfix f065's measured anchor was −44), rings **+13** (anchor +14), P2 tail body R−B
−10.45 → **+0.37/+0.46**, arch invariance **0 px**, KB-overwarm rings **−20** (< +5, its own
failure, correctly) — and then **P-F4 fired: restore-vs-base = 216 px ≠ 0 at ΣRGB ≥ 4.**
Per the seal's letter, **every arm number in that boot is void.** They are quoted here as
provenance for the rerun's expectations, not as scores.

The confound, bounded before the rerun (§159's discipline — a failed control can still bound
its confound):

- The 216 px are **one 152×12 strip at (527–679, 251–263)** — the cane-hook/strap FX region
  at 3× crop — **disjoint from every scored ROI** (creamROI x802–862 y306–356; rings
  y250–300 x820–880 — no x overlap; CRITIC tail rect y290+ — no y overlap; WALL-SHADOW
  x922–962). Max |Δch| 89; 0.023 % of frame.
- The strip is **bit-stable through every treatment arm**: base→A / base→AB / base→KBoverwarm
  each differ by **0 px inside the strip**. It flipped exactly once, between the KBoverwarm
  capture (+431 s) and the restore capture (+457 s) — a one-off asynchronous settle ~7 min
  into the boot, not a lever effect.
- Every lever readback restored bit-exact (`uShadowColor` ≡ base to full float precision,
  subjW 0.5), and the frame-wide diff equals the strip exactly — the levers' own populations
  carry **zero** residual.

Root cause in the runner, not the seal: the seal's §8 says "poke AFTER `setShot` settles"
and the runner under-implemented it — the first scored arm carried the ~350 s program-warm
render, stretching base→restore to ~7.5 min of wall clock across the settle. Remedy: the
runner now runs **10 frozen frames + a throwaway capture after every setShot** before any
scored arm, and chunk A **reruns in full** (quarantined originals kept as
`banda1/voidA-sly-closeup.*.png` + `voidA-readback-A.json`).

### Rerun (r2, settle-patched, log `logs/banda1-r2.log`)

- Chunk A (sly-closeup: base / A / AB / KBoverwarm / restore): **rerunning.**
- Chunks B1 (hero), B2 (interior) — base / B / AB / KBwarmmud / restore: pending.
  **Disclosed deviation:** the seal grouped hero+interior in one boot; r2 runs one shot per
  boot (B1/B2). Nothing in the seal's scoring crosses the two shots (P3/P4/P-F4 are
  within-shot, arm-vs-base same-boot); the split shortens lock holds against the ~45-min
  rollback cadence the seal's own §8 cites.
- Chunk C (night: base / AB / restore — the P7 collision proof): pending.
- Chunks D1 (temple), D2 (combat) — base / AB / restore; optional: pending.
- First-attempt readback fact kept for §6: arm A leaves `uShadowColor` **bit-equal** to base;
  arm AB moves it **×1.0740** per channel vs the offline port's predicted ×1.0736 (kUsed
  3.37/3.139 at tod 0.80) — port and live uniform agree to 4 decimals.

## Scores

(To be filled by `node progress/records/banda-diag.mjs score progress/records/banda1` —
the P-table lands here verbatim once chunks complete; per-chunk partial scores are run as
each chunk's frames land, durably, before the next chunk is awaited.)

**Resume instructions if a rollback takes this session** (per §163/§164): the capture is
`progress/records/banda1.mjs` (idempotent — chunks whose frames all exist are skipped;
relaunch with `bash tools/launch.sh /home/user/Demo/progress/records/banda1.mjs
/home/user/Demo/progress/records/logs/banda1-r3.log <scratchpad>/banda1.pid all` after
sweeping the lock queue against /proc per §140.2). Score with the command above; bands are
in the scorer and the seal, verbatim. `voidA-*` files are the quarantined first attempt —
never score them.

## Verdict

Pending. Per the seal: PASS requires P1–P5 in-band on the candidate arms with both KB arms
reading as their own failures, P-F4 = 0 px per chunk, P-F5 = 0 px, and P7 = 0 px off-subject
at night (P-F6: without the night proof the candidate does not ship regardless).
Ship decisions are the coordinator's.

---

## VERDICT — scored by the coordinator at first wake per §163.2 (sealed scorer, unmodified; SHADING's transcripts died in the §170 rollback)

**The candidate does not ship on this seal.** Two independent registered outcomes:

1. **P-F6 fires.** P7 (night, AB vs base, same boot) read **63 differing px outside the subject
   box** against the registered band [0,0]. The seal's own words: "candidate does not ship on
   this seal regardless of P1–P5." The §6 collision arithmetic claimed zero by construction —
   63 real pixels falsify that proof, which is itself the finding: some term in the
   shadowTintPeak/subjWarmShade pair reaches night off-subject pixels through a path the
   arithmetic did not cover. (In-subject night movement, expected and allowed: 2,067 px.)
2. **KB-warmmud never showed its signature.** Grey-collapse requires satP50 falling ≥35%
   relative on ≥2 of 3 wall rects; measured hero 13%, interior 23%/27% — zero of three. Per the
   seal's §13 clause the gates it guards are UNSCOREABLE. The port predicted 40–55% drops; the
   frame delivered a third of that — the port-vs-frame gap is the second finding, and it is the
   §18-family hazard (a model validated against percentiles the frame does not reproduce).

Everything else held: all five restores bit-identical (P-F4 = 0 px on every chunk), arch
invariance exact, KB-overwarm separated correctly, every P1–P5/P8 band PASS. The full scorer
table is quoted verbatim below per the seal's requirement.

**Routing:** the night-leak mechanism and the KB port gap go to the next SHADING candidate's
prereg as its first two obligations; the warm-restoration goal itself remains live (the P1–P5
numbers show the levers do what the port said ON DAY SHOTS — what failed is the collision
guarantee, not the direction). No src was touched; there is nothing to revert.

```
banda-diag — drift guard PASS (47 constants + 13 load-bearing lines asserted against committed source)

═══ score — PREREG-banda quantities on progress/records/banda1 (bands verbatim from the seal) ═══
  BaseGate creamROI b−r      -20.00  band [-28,-12]  PASS
  BaseGate rings b−r         27.00  band [15,35]  PASS
  P-F5 arch invariance (A) px 0.00  band [0,0]  PASS
  P-F4 sly-closeup restore-vs-base differing px (ΣRGB≥4): 0
  P1 creamROI b−r (A)        -45.00  band [-58,-30]  PASS
  P1 rings b−r (A)           13.00  band [5,45]  PASS
  P2 tail body R−B (A)       0.37  band [-4,18]  PASS
  P1 creamROI b−r (AB)       -45.00  band [-58,-30]  PASS
  P1 rings b−r (AB)          13.00  band [5,45]  PASS
  P2 tail body R−B (AB)      0.46  band [-4,18]  PASS
  KB-overwarm rings b−r      -20.00  band [-999,5]  PASS
  P3 hero.arch Δ<L40pp (B)   -2.43  band [-6,-0.5]  PASS
  P5 hero body hue (B)       221.33  band [200,246]  PASS
  P3 hero.arch Δ<L40pp (AB)  -2.42  band [-6,-0.5]  PASS
  P5 hero body hue (AB)      221.33  band [200,246]  PASS
  KB-warmmud hero body satP50 0.323→0.281 (rel drop 13%; needs ≥35% on ≥2 wall rects overall)
  P-F4 hero restore-vs-base differing px (ΣRGB≥4): 0
  P4 int wall0 ΔmedL (B)     4.36  band [1,8]  PASS
  P4 int wall1 ΔmedL (B)     4.37  band [1,8]  PASS
  P5 interior body hue (B)   225.00  band [200,246]  PASS
  P5 interior body hue (B)   225.00  band [200,246]  PASS
  P4 int wall0 ΔmedL (AB)    4.36  band [1,8]  PASS
  P4 int wall1 ΔmedL (AB)    4.37  band [1,8]  PASS
  P5 interior body hue (AB)  225.00  band [200,246]  PASS
  P5 interior body hue (AB)  225.00  band [200,246]  PASS
  KB-warmmud interior body satP50 0.391→0.300 (rel drop 23%; needs ≥35% on ≥2 wall rects overall)
  KB-warmmud interior body satP50 0.430→0.316 (rel drop 27%; needs ≥35% on ≥2 wall rects overall)
  P-F4 interior restore-vs-base differing px (ΣRGB≥4): 0
  P5 temple body hue (AB)    207.00  band [200,246]  PASS
  P-F4 temple restore-vs-base differing px (ΣRGB≥4): 0
  P7 night off-subject Δpx   63.00  band [0,0]  FAIL
    (in-subject Δpx, allowed and expected warm-ward: 2067)
  P-F4 night restore-vs-base differing px (ΣRGB≥4): 0
  P6 hero warm% 9.1 → 9.0 (Δ -0.1 pp; honesty row, ≤ +3–4 pp expected)
  P6 interior warm% 7.5 → 7.3 (Δ -0.2 pp; honesty row, ≤ +3–4 pp expected)
  P8 combat warm% ratio (AB/base) 1.00  band [0.85,1.15]  PASS
  P-F4 combat restore-vs-base differing px (ΣRGB≥4): 0
  P-F4 temple restore-vs-base differing px (ΣRGB≥4): 0

  25 scored, 1 FAIL — the RESULT quotes this table verbatim.
```
