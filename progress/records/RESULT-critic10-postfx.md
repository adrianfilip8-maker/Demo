# RESULT-critic10-postfx — item 1 NO-SHIP on the seal's letter (candidate mechanically clean, three bars mis-aimed; reseal follows); item 2 ATTRIB-PASS — the r10 "lens ghosts" are §135's sandHigh discs, routed to FX

Scored against `PREREG-critic10-postfx.md` (sealed at 070ecdd before any frame) by the sealed
scorer run unmodified; output verbatim `progress/records/logs/c10postfxan-run2.log`; verdict
JSON `progress/records/critic10postfx/verdict-run2.json`. The crops were looked at.

## Provenance, including two incidents this run owns

- **Run 1 (killed, no evidence quoted from it):** launched via a tool-call wrapper; another
  lane's launcher hygiene (§78.4 family) swept the wrapper mid-window after the 7 traversal
  arms. The kill bypassed `onReleasing`, **stranding the installed candidate in `src/**` —
  which poisoned the torch lane's boot at their lock handoff** (their run 1 "aborted unscored:
  foreign PostFX arm raced the lock handoff", 30a02bd — caught by their hardening, not by me).
  Recovery: `git checkout -- src/render/PostFX.js` (verified byte-equal to the candidate before
  restoring, so nothing else was overwritten); frames cleared; relaunch via `tools/launch.sh`
  (detached, ppid 1). Log kept: `logs/c10postfx-run1-killed.log`.
- **Run 2 (the scored run):** treestamp at lock-acquisition: head 04d7b76, **dirty src:
  (none)** — a clean boot tree. Candidate installed onLocked (sha cd8ff982…), all arms
  captured with `{dt:0}` (every shot at world t=0.25), per-arm applied-uniform readback
  (`subjCut` 0/1 as configured, §40). **Killed by the coordinator during `sly-profile`'s
  registered retry**: `step(300, 1/60)` is 300 full SwiftShader renders ≈ 8–12 s each — the
  retry rule as sealed holds the FIFO lock for ~an hour, and two waiting lanes hit their
  3-hour give-ups. The kill cost the end-of-run manifest and the sly-profile gen-2 /
  kaykit captures; **src was restored to base bytes** (verified: working tree clean).
  `c10postfx-run2-reconstructed.json` carries the probe fields transcribed from the runner's
  own stdout (`logs/c10postfx-run2.log`) and says so in its top-level field; the frames on
  disk are the record. **Lesson banked for the reseal: a retry that steps the world clock
  must use few large-dt frames (e.g. `step(15, 0.334)`), and this run's retry design was the
  lock-starvation §279 warns about.**
- Renderer: SwiftShader (both boots). Validity gates: `back == base` **strict 0 px on all 7
  captured shots**; `kaykit` MISSING → VOID (fail-closed, never captured).

## Item 1 — the character-bloom gate: NO-SHIP as sealed, and what the frames actually say

| bar | measured | letter |
|---|---|---|
| B1 premise | traversal diff(base,subj1) = **318 px ≥ 300**; bloomoff 28 269 | PASS |
| B2 containment | traversal **0.00%** in player-bbox+128 (all 318 px at (974–1001, 43–80)); closeup **100%**; hero **0%** (2 px at (950,458)) | **FAIL** |
| B3 darker-only | 24 / 59 / 1 px brightened > 2 L (traversal / closeup / hero) | **FAIL** |
| B4 halo-keep | LAMPS / MOON / TORCH-A / TORCH-B under subj1: **0.000 / 0.000 / 0.000 / 0.000**; bloomoff drops them −33.5 / −33.2 / −10.9 / −14.8 (vacuity 4/4) | PASS |
| B5 critic's read | SUBJ-DISPLAY 78.87 → 78.87, p99 154.2 → 154.2; BALL 73.54 → 73.54 | **FAIL** |

**NO-SHIP.** The letter binds (§26.5: widening after the fact is the sin). And the letter's
three failures are each an aim error the run itself diagnoses, not candidate harm:

1. **B2 failed on the gate's own documented population.** The 318 traversal pixels are the
   **roof guard** at (974–1001, 43–80) — skinned, therefore masked, exactly as PREREG §3
   documents ("Sly, guards, Carmelita") — while B2's containment region tracked only the
   player's bbox. The gate removed the guard's glowing-arm bloom (the critic's own guard
   complaint family); the bar called that leakage. hero's 2 px: same shape.
2. **B3 failed on FXAA re-resolve.** Every brightened pixel rides an ink/silhouette edge whose
   neighbourhood the gate darkened (worst −43 L single-pixel flips, 2.4% of closeup's changed
   population). A zero-tolerance count on a morphological AA pass was unmeetable by any change
   that touches any edge; the +2 L allowance was the right idea at the wrong quantifier.
3. **B5 anchored on a pulse-phase phenomenon.** This boot froze at t=0.25 with the sparkle
   pulse near its trough: the r10 "white ghost + flare ball" is simply not in the frame
   (SUBJ-DISPLAY p99 154 vs the bar's "drops below clipping" — §26.1's sealed-impossibility
   family, disclosed rather than reinterpreted). Crops: `c10postfx-traversal-subj-*.png` —
   Sly reads crisp and saturated at base in this phase.

**What the run proves about the candidate, for the reseal to re-test under corrected bars:**

- **Selectivity is exact where it must be**: the four wanted-halo ROIs move 0.000 under the
  gate while bloom-off moves them −11…−34 L; `night` is **0 changed px whole-frame**.
- **The subject's own feed is real and the gate removes it**: sly-closeup 2 555 px darker at
  mean 5.2 L (97.6% darker-side), 100% inside the subject bbox, hugging his sclera, chest and
  glove highlights (`c10postfx-closeup-{base,subj1,diffmap}*.png`).
- **The critic's suggested lever measured, for the record** (traversal, report-only): T260
  SUBJ 78.9→77.8 / T290 →76.6 — the knob dims the region by cutting the *sparkles'* bloom
  (unselective), while the flame client's feed falls 41%/86% by the shipped model — the knob
  cannot say "never" and pays wanted clients for it.
- **The "flare ball" decomposition** (routing evidence): BALL ROI 73.5 base / 68.2 bloom-off /
  66.7 sparkles-off — at this dim phase the region carries ~5.3 L of bloom and ~6.8 L of
  sparkle quad+halo; at r10's phase it reached L≥238 clusters. The ball is `SparkleField`'s
  near-player-boosted marker (core ≈ scene 6.2 in B at full boost) — **FX-owned**, joining the
  r10 "sparkles ship white" routing.

Reseal: `PREREG-critic10-postfx2.md` (bars re-aimed at the mask population, FXAA-count
allowance, changed-population effect statistic per §135.1's dilution lesson; capture matrix
cut to the five subj1 shots; no ghost arms, no retry, no long steps).

## Item 2 — ATTRIB-PASS: the "lens ghosts" are the sandHigh pairing defect, third naming

| shot | component (diff base vs no-sandHigh) | mean ΔL | backdrop under it (no-sandHigh frame) | G2 |
|---|---|---|---|---|
| temple | **2 492 px** at (602,138)–(656,194) | **+19.90** | rgb(9,51,96), luma 45.5, R/B 0.09 — the blue star ceiling | sandLow **0.00**, shimmer **0.00** |
| night | **1 616 px** at (150,23)–(199,70) | **+12.80** | rgb(8,18,40), luma 17.5 — night-dark structure | n/a (not a discriminator shot) |
| sly-profile | none ≥ 800 px at t=0.25 (registered retry initiated; killed mid-step — gen 2 never captured) | — | — | — |
| kaykit | VOID — never captured (same kill) | — | — | — |

**2 of 4 fired → ATTRIB-PASS as registered, and the looking confirms it**: the temple crop is
the soft mauve-pink disc over the star ceiling, gone to clean blue with `sandHigh` hidden; the
night crop is its warm-mauve cousin over dark structure, gone the same way
(`c10postfx-{temple,night}-ghost-{base,nosandhigh}-3x.png`). temple's component reproduces
§135/fx20's disc **across boots and trees a third time** (+19.9 over backdrop 45.5 / R/B 0.09
here vs fx20's +17.28 over 44.6 / 0.13), and G2 says the other two ambient fields own **0.00**
of it. The r10 crops (`c10postfx-r10-*.png`) carry the `dustPainter` tile signature —
overlapping hard-edged discs with the two-band cel terminator — on all four critic framings.

**No POSTFX ship, as registered in the seal**: PostFX.js contains no flare/ghost/lens pass
(the chain was read end-to-end before sealing: scene → normals → AO → ink → bloom → composite
→ FXAA), and a scene-side alpha sprite is invisible to every surface the composite owns.
**Routed to FX**: pool `sand_haze`/`sandHigh`, mechanism = sprite/backdrop pairing (§138.3),
size/near-fade fixes already measured wrong (§138.1–.2), candidate 1 (backdrop gate) already
REJECTED at fx22 r4 D1, §138.5's enclosure/zone gate the surviving ranked candidate — any next
design needs its own seal and must answer fx22's leak record. This run adds the two fresh
components above and binds the critic's r10 "lens-ghost" language to the mechanism.

## Files of record

`progress/records/critic10postfx/` (seal, runner, scorer, candidate, patch, treestamp,
verdict-run2.json, reconstructed manifest) · `progress/records/logs/c10postfx-run{1-killed,2}.log`,
`logs/c10postfxan-run2.log` · `progress/records/crops/c10postfx-*` (15 files) ·
frames in `shots/c10postfx/` (gitignored working output, 32 PNGs, one boot).
