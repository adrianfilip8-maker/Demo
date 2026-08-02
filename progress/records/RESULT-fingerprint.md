# RESULT — shadow-cache fingerprint, geometry-content hazard (V1–V3)

Scored against `progress/records/PREREG-fingerprint-geometry.md`, bands untouched. Run:
`shots/fpv/` (fpv.json), tree `9401cc7`, fix under test `58b66c1`, lock released 15:49.

**Seal baselines, pinned as the PREREG required:** target mesh `arch:hall:hieroglyph_wall`,
**75,384 triangles** (largest tracked static); refresh counter immediately before V3's
window = **14**. Cache engaged on every cached job (`engaged: true`), disengaged on both
legacy jobs — valve not tripped, run valid. Statics tracked 334, dynamics 13, cascades
c0 auto / c1+c2 cached.

## Outcome

| leg | measurement | band | verdict |
|---|---|---|---|
| V1 stake — cached vs legacy after in-place position edit | **0 px** | `=0` | **PASS** |
| V1 non-vacuity — after-edit vs before | **105,748 px** (peak ΔL 158.9) | `≥200` | **probative** |
| V2 stake — cached vs legacy after drawRange edit | **0 px** | `=0` | **PASS** |
| V2 non-vacuity — after-edit vs before | **12,406 px** (peak ΔL 117.8) | `≥200` | **probative** |
| V3 null control — refresh delta over 100 dt-0 frames | **26** (14 → 40) | `≥9` | **FAIL** |

Neither non-vacuity leg landed in WEAK or VOID; both edits moved six-figure and five-figure
pixel counts, so V1/V2 are real tests and their zeros mean something. A cross-check with the
cache out of the loop (legacy-v1 vs base) reproduces V1's 105,748 px exactly — the edit is
visible independently of the mechanism under test.

## Remedy: REVERTED, not withheld

The fix shipped at `58b66c1` before its verification ran, so on a FAIL the registered remedy
(§26.3) is removal from the tree, not withholding of an unshipped change. **What actually
happened: reverted.** `src/render/Lighting.js` is untouched by any commit since `58b66c1`, so
that commit's hunks for that file reverse-applied cleanly (`git apply -R`, checked first).
Verified after: none of the five terms (`geometry.id*31`, `index.version*37`,
`position.version*41`, `drawRange.start*43`, `drawRangeCount*47`) remain, the KNOWN-GAP note
is restored at line 1416, `node --check` passes. The working tree carries the revert
**uncommitted** for sweep; the unrelated §1 budget-addendum content of `58b66c1` was left
alone. The hazard is therefore latent-and-recorded again, exactly as before 13:46.

## Why V3 failed — and why that does not rescue the fix

The 26 is arithmetic, not mystery. `_updateShadowCache()` runs the caster census on a fixed
cadence — `if (!this._staticCasters || (this._cachePoll++ & 7) === 0) this._censusCasters()`
— and `_censusCasters()` ends with `this._staticSig = NaN`. NaN never compares equal, so
**every 8th frame forces a full static refresh on every cached cascade whether or not the
set changed**. Over 100 frames: 12–13 censuses × 2 cached cascades = 24–26, plus the 2 the
restore itself owes = 26–28. Measured 26.

That mechanism arrived with the **original** cache commit `002f27e` (00:44), seven hours
before the fix under test (`58b66c1`, 13:46) — confirmed by reading `58b66c1^`, where both
lines are already present. And the fix's own terms are demonstrably *not* the jitter: the V1
leg spent exactly +2 refreshes and the V2 leg exactly +2, one per cascade per edit, with no
excess anywhere. A jittering term would have shown up there first.

**This diagnosis directs the follow-up; it does not overturn the verdict.** The band was
registered before any code existed and 26 lands in `≥9`. Re-reading a band after seeing the
number is the failure mode the seal exists to prevent, and "the failing control does not
implicate my change" is precisely the argument that would manufacture a pass. The verdict is
FAIL, the remedy is executed, and the real defect the control caught is now named.

**What the control actually found is worth more than the fix it failed:** the shipped cache
re-renders every static into both cached cascades on 12.5% of frames for no reason. That is
a live steady-state cost in the shipping build, not a latent hazard — the null control was
built to prove the fingerprint was quiet and instead measured the cache paying a bill nobody
knew it had.

## Follow-up, registered now (not run — captures are yours to schedule)

1. Make `_censusCasters()` reset `_staticSig` only when membership actually changed (hash the
   set, compare, reset on difference), so an unchanged world costs zero refreshes.
2. Re-run V1–V3 unchanged against the re-applied geometry fix. V3's `=2` band becomes
   reachable only after (1); until then the control cannot pass for any fingerprint, which is
   why re-running it against the current cache would fail identically and prove nothing.

## Carry-ins closed

- **§28 (phase drift via `step()`) — immune by construction, stated explicitly as asked.**
  `fpv.mjs` contains no `G.step()` call at all: every capture is preceded only by
  `E.renderFrame(0)` (3 per leg, 100 for V3), which advances `frame` and never `engine.time`.
  All five frames sit at `time 0.5333`, one boot, one staged camera. No leg compares captures
  taken across a `step()`, so none needs reading under §30 — this run was pinned by
  construction rather than by luck.
- **§30 (phase-dirty statistics) — V3's statistic is phase-immune by construction.** It scores
  `_cacheStats.refreshes`, a module counter incremented in `Lighting.update()`; it reads no
  pixels and cannot be moved by FX phase, mote seeding or flicker. The V1/V2 statistics are
  pixel counts — the family §30 voids under phase contamination — but they are exempt here
  for the reason above: their pairs are dt-0 frames from one clock, not captures across a
  step. Their zeros are therefore genuine bit-identity, not phase noise cancelling.
- **Counter-window rule (corrected column only).** Not quotable from this run and deliberately
  not quoted: `fpv` measured no cache-vs-legacy saving. Its `stats` rows (249 draws /
  1.682M) are counted-column figures carried for provenance only. The correct saving is
  statics amortised by refresh rate — and this run just measured that rate to be 12.5% of
  frames rather than the ~0 the steady-state claim assumed, so **any previously quoted
  corrected saving for a static camera is overstated and should be re-derived after
  follow-up (1)**, not re-used.
