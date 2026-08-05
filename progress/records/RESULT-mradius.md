# RESULT — mradius: the §24.3 moulding-radius arm (PREREG-mradius.md + ADDENDUM-mradius-arrisweight.md)

**STATUS: SCORED — VERDICT: REVERT, NO SHIP of the −40 % arm, by the sealed P4 rule.
The revert is already physically true: src was restored byte-verified before every ticket
release and carries zero bytes of this arm (Kit `9ee3506f47a9…`, EgyptLevel `b2527f77f067…`,
`arrisBand` count 0 in src, re-verified at scoring). The mechanism is now MEASURED
end-to-end and the ADDENDUM's corrected model is CONFIRMED — see "What the run measured".**

Captured and scored 2026-08-05 by the GEOMETRY agent (the seal's author, per the §174
dispatch; scored at first wake after DONE per §163.2). Runner `progress/records/mradius-run.mjs`
(pid 6863, ppid-1 verified via `tools/launch.sh`; FIFO ticket behind SKY's skyswirl);
scorer `progress/records/mradius-score.mjs`; instrument `kerbband2.mjs` **calibration
re-run at scoring: rim2 causal 1,691 EXACT, lift p50 110.9** — counts below are quotable.

## Pre-capture state (verified before any lock time)

- The src tree moved between seal (`3be168ae28832f69`) and dispatch (`7a4630875cac6e36`,
  the hullkerb gold gate landing); `mradius-proj.mjs` re-ran clean on it: all 17 source
  anchors OK, both committed counts EXACT — every constant the seal stands on was unmoved.
- The patch was verified OFFLINE (scratchpad `verify-patch.mjs`; table in the ADDENDUM):
  `arrisBand: null` builds BIT-IDENTICAL buffers; `0.348` splits the annulus with exact
  (0,1,0) inner normals; `0` splits normals at the arris (75.1°/0°). The ADDENDUM —
  committed BEFORE any frame — recorded the corrected arris-steepening model
  (n_cand point ≈ 710–760 vs the sealed linear 1,025) with the sealed gate untouched.
- Liveness probes were wired per arm (counted tris delta; specified-is-not-live).

## Chunks landed (all three; per-arm fresh vite + fresh navigation; edits only inside tickets)

| chunk | boot window (Z) | arms (srcAtArm) | probes |
|---|---|---|---|
| C1 hero | 20:49–21:23 | base/restore `3be168ae28832f69` — **the seal's exact tree** (a rollback restored pre-goldgate src before C1); cand `bb822753ae7949e8`; kb `2325e84e3dc23f7d` | draws 260 all arms (+0); tris +192 cand/kb, 0 restore |
| C2 night | 21:44–22:17 | base/restore `dfa198283676610f`; cand `cf51f3448499c256`; kb own stamp | draws 288 all arms; tris +192/0 |
| C3 courtyard | 22:38–23:08 | base/restore `a8925573a9ec3ff6`; cand `4947b10c4441d93b`; kb `7e32d9310cf5048a` | draws 281 all arms; tris +192/0; **base and restore frames sha-IDENTICAL** |

The committed tree moved between chunks (other owners shipping; the gold gate rolled in
and out under the run) — every registered comparison is within-chunk, and within every
chunk base/restore share one pristine-tree stamp while cand/kb are exactly that tree plus
the patch. Pristine restore byte-verified at every release (run-log lines). The single
console 404 (base arms only) is adjudicated by C3's bit-identical base/restore pair: zero
frame effect.

## The registered numbers

**Hero (decisive), kerbband2 non-causal in the frozen ROI:**

| arm | n | sealed gate | outcome |
|---|---|---|---|
| base | **1,708** | [1,674, 1,742] | **P1 PASS** — exactly R2's figure, on literally the seal's tree |
| cand | **721** | [769, 1,281] | **P4 count FAIL as sealed** — 6.2 % below the floor |
| kb | **0** | ≤ 400 (exp ≤ 170) | **P5a PASS** — total band kill |
| restore | **1,708** | = base | count identical across independent pristine boots |

- **P2** hero: temporal mask (base≠restore, any-channel>0) 25,990 px = 2.820 % ≤ 3 % PASS;
  **ROI∩mask = 4,660 px ≠ 0 → the sealed letter fires: "hero counts do not stand."**
  Reported with the direct evidence beside it: both pristine boots count **1,708 EXACTLY**
  — the ROI count is measured boot-invariant; the mask px are Δ1–2 cross-boot phase
  shimmer that never crosses the frozen class thresholds. The letter stands as sealed and
  does not change the verdict (every path converges — see VERDICT).
  night: mask 66,377 px = 7.202 % > 3 % → **night chunk VOID as sealed** (P6 is reported
  as directional evidence, not a formal PASS). courtyard: mask **0 px** — deterministic
  boots to the byte.
- **P3** (confinement, outside temporal mask; region = treated cornices + 6 px, validated
  pre-frame to contain 1,708/1,708 of the measured band):
  - courtyard cand: 4,881 changed px, **7 outside** — all Δ1–2 hugging the region
    boundary. Substantively confined; the seal's ~0 prediction held.
  - hero cand: 10,273 outside, **10,003 of them Δ1–2** + 107 ≥Δ8 scattered in sky/haze
    rows — cross-boot animated-phase residue a two-sample mask cannot cover. The
    controlled comparison that settles attribution: **hero kb — same patch mechanics,
    larger local change — has 171 outside px and ONE ≥Δ8.** The mechanism does not leak;
    the phase does. night likewise (cand: 1,814 @Δ1–7, 5 ≥Δ8).
  - **courtyard kb: 88,450 outside px, frame-wide, deterministic** (P2 there is 0) —
    98.3 % at Δ1–7, with the ≥Δ8 remainder in the sky glow and bright ground: the global
    bloom field re-normalising after the kb tree deletes the terrace edge-highlight
    class. **P3 FAIL as sealed on the kb arm** (broad-area change), recorded as part of
    KB reading as its own failure, not as a candidate defect. **Zero silhouette-edge
    movement in any arm** (positions coplanar by construction; geography confirms).
- **P5** (the §13 calibration arm reads as its own failure — all three elements):
  (a) n = 0, no continuous ≥4 px bar anywhere in the ROI at 4× ✓; (b) the 4× crop shows
  the soft ~15 px gradient collapsed to a flat dark annulus with a 1–2 px stair-stepped
  hairline at the silhouette — **the registered grazing crawl** ✓; (c) the night traces
  dead or gutted ✓ (below). **kb vs cand is unmistakable (0 vs 721; crops distinct) — no
  §141 UNSCOREABLE outcome.** The viewing condition scores this question.
- **P6** (retention at the three committed-coordinate night sites, L≥90 in-bbox; night
  VOID caveat applies):
  | site | base | cand | kb | restore |
  |---|---|---|---|---|
  | tc2-north | 332 px, maxL 153 | **186 (0.56×), continuous** | 127, **broken** | 332 |
  | tc2-south | 176 px, maxL 149 | **56 (0.32×), continuous, dimmer (maxL 126)** | **12 — dead** | 172 |
  | tc2-west | 80 px, maxL 154 | **40 (0.50×), continuous** | **7 — dead** | 80 |
  Crops confirm: cand keeps every trace as a continuous thinner line (north on the ~0.6×
  prediction; south undershoots — the same steepening that moved P4); kb kills south/west
  and fragments north. Retention behaves exactly as registered for cand and fails exactly
  as registered for kb.
- **P7** (price): draws **+0** in all arms, all shots; restore **0/0 exactly**.
  Counted-column tris **+192** = the 64-triangle geometry delta through 3 counted passes.
  The seal's "≤ +150" quoted the counted column while deriving the geometry figure
  (64 ≤ 150 ✓) — my own instance of the §130.3 counted-vs-scored trap, flagged: both
  readings stated; the substance (negligible, symmetric, zero draws) is met.

## What the run measured (the record half of revert-and-record)

1. **The moulding-radius mechanism is real and quantified.** Confining the cornice
   top-annulus turn 0.58 → 0.348 m (−40 %) moved the band 1,708 → 721 = **0.422×**, the
   band visibly narrowed, single, clean, continuous around the NE corner at 4×, and the
   night deck-edge traces retained at 0.32–0.56×.
2. **The sealed linear model (count ∝ s, point 1,025) is REFUTED, and the ADDENDUM's
   corrected steepening model is CONFIRMED:** pre-frame it predicted 710–760 from the
   area-weighted arris-normal steepening (26.3° → 35.4°, measured on the built mesh);
   the frame delivered **721, inside the pre-registered corrected band.** Scaling law:
   ratio = [s / tilt(s)] / [0.58 / 26.3°], tilt(s) = atan(0.2999 / (0.0801 + s)).
3. **The radius→0 hard edge is the measured failure it was registered to be**: band gone,
   grazing crawl at the arris, night traces dead — plus a deterministic frame-wide bloom
   re-normalisation in courtyard from deleting the intended highlight class. The KB look
   damages frames far beyond its own edge.
4. **For any v2 prereg (not armed here; coordinator's call):** the corrected model puts
   the original sealed intent (0.60× count, n ≈ 1,025) at **s ≈ 0.435 — the seal's −25 %
   row** — mid-band of [769, 1,281] under the now-measured scaling law, with wider margin
   on the retention ratios too. The instrument set (runner, scorer, crops, sites,
   calibrated kerbband2) is reusable as-is.

# VERDICT

**REVERT — no ship of `arrisBand` 0.372/0.348.** By the sealed ship rule: P4's count
landed outside its registered band (721 < 769) and the sealed consequence is
revert-and-record, no re-threshold; independently, P2-hero's sealed ROI∩mask clause and
the night-chunk mask VOID mean two further gates cannot formally PASS as sealed. Every
path through the sealed gates converges on no-ship. The crops' favourable look — a
genuinely better edge read at cand — is recorded as a finding for the v2, not a defence:
the gate is the gate.

**Scaffold disposition (the coordinator's question):** the `arrisBand` opt-in is NOT a
staying scaffold and is not in the tree — src carries zero bytes of this arm, verified at
scoring. Nothing to revert; the cand diff exists only in this record and the runner's
patch functions, available to a v2 prereg.

## Files created/modified by capture + scoring (for the coordinator's sweep — no git run)

- Modified: `progress/records/RESULT-mradius.md` (this file — completes the in-progress skeleton).
- Created earlier this session (committed per dispatches at `1ddae5d`/`296619d`):
  `progress/records/PREREG-mradius.md`, `progress/records/mradius-proj.mjs`,
  `progress/records/ADDENDUM-mradius-arrisweight.md`, `progress/records/mradius-run.mjs`,
  `progress/records/mradius-score.mjs`.
- Created, `progress/records/mradius1/`: 12 frames
  (`{hero,night,courtyard}.{base,cand,kb,restore}.png`), `readback-C{1,2,3}.json`,
  `pristine.json`, `run-log.txt`, `run.pid`.
- Created, `progress/records/mradius1/crops/` (19 PNGs):
  `hero-roi-{base,cand,kb,restore}-4x.png`, `hero-necorner-{base,cand,kb}-4x.png`,
  `night-tc2{north,south,west}-{base,cand,kb,restore}-3x.png`.
- `src/**`: NET ZERO — every edit lived only inside a held ticket and was restored
  byte-verified before release (per-chunk verification lines in `run-log.txt`).
- Scratchpad-only (not committed): patch verification, region-mask validation, crop batch
  script, outside-population analysis.
