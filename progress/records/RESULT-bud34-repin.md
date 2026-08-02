# bud34 — re-pin after the 11:33 restart destroyed shots/bud34/ (frames + report.json)

This file re-creates, from the session transcript, the record first written at 08:5x as
RESULT-bud34.md and lost in the restart. The frames and manifest no longer exist anywhere;
**this table and the transcript are the record.** Nothing below is newly measured — it is
the 08:5x measurement re-stated, with its provenance.

## THE COUNT, corrected a second time: bud34 has EIGHT rows, not seven and not nine

The circulating figure has now taken four values (9 → 7 → 8 → 7). The manifest, read at
08:5x before it was destroyed, contained **8 shot rows and 8 PNGs; missing were `combat`
and `guard`** — the last two in harness order; the run died after `traversal` (08:48:33).
Any plan phrased against "the seven-frame table" should read "the eight-row table".

## Provenance

- Boot 2026-08-02T08:15:14.257Z, commit `4f69f3e` +dirty, 1280x720, quality high.
- Frame mtimes: hero 08:23:35 · temple 08:27:09 · sly-closeup 08:31:19 · courtyard
  08:35:15 · dunes 08:38:18 · interior 08:40:05 · night 08:44:29 · traversal 08:48:33.
- Mid-window src edits existed (EgyptLevel 08:23:17.8, SlyModel 08:24:37.9, PostFX
  08:42:01.3) and DO NOT contaminate: `shot.mjs` spawns vite with `SANDS_NO_HMR=1`
  (guard landed `e04c9ec`, 2026-07-30 20:48), which sets `hmr:false` +
  `watch:{ignored:['**/*']}`; the page is never reloaded between shots; bud34.log carried
  no 404/reload marker. All 8 frames render the boot tree coherently. The re-baseline
  (bud35) is still required — but because a completion capture would seam ACROSS boots,
  not because these 8 disagree among themselves.

## The eight rows (counted column — renderer.info all-pass totals, NOT a §1 score)

| shot | draws | triangles | programs | ms |
|---|---|---|---|---|
| hero | 249 | 1,680,721 | 94 | 11.5 |
| temple | 221 | 1,621,959 | 94 | 9.8 |
| sly-closeup | 244 | 1,583,085 | 94 | 14.7 |
| courtyard | 255 | 1,606,455 | 94 | 10.7 |
| dunes | 258 | 1,516,049 | 136 | 9.9 |
| interior | 149 | 655,857 | 136 | 6.9 |
| night | 272 | 1,775,487 | 136 | 8.4 |
| traversal | 241 | 1,682,671 | 136 | 8.3 |

§1 is scored on MAIN-VIEW VISIBLE triangles (fixed ruling): only `tools/budget.mjs`
measures that. If budget34's worst shot comes back inside 250 draws / 1.2M tris, #34
closes as bookkeeping and pass multiplication stays a frame-time item this GPU-less
container cannot settle. Do not quote a row of the table above against 250/1.2M.

## Standing quoting rules (unchanged)

- Counter window: Engine resets `renderer.info` AFTER module updates; the shadow cache's
  static refresh renders inside `Lighting.update()` and is invisible to `engine.stats`.
  Counted drop = statics+dynamics; true steady saving = statics only, amortised by the
  refresh rate (`L._cacheStats.refreshes`). Quote the corrected column.
- 2x2 only: geometry arm = legacy-vs-legacy across trees; cache arm = cached-vs-legacy in
  one boot. `courtyard` stays excluded from the geometry arm (no valid "before").
  Surviving pre-cache references: shots/fx6/fx6.json + shots/fx7/fx7.json (hero.full
  402 draws / 2.725M counted; fx7 hero.full 402/2.725M-class, same protocol).

## Post-restart queue (verified: every pid is ppid 1 AND a session leader; tickets live)

    agx1 (3742, holds lock) → cap5 (3751) → budget34 (3762: night guard courtyard hero,
    log scratchpad/budget34.log) → bud35 (3788: all ten shots → shots/bud35/report.json)

bud35 boots a tree WITH the tail tune (44dede5) and sly-key (a121e9a): its character rows
are current where fx15's predated both — note the stamp when quoting; with it stamped, the
difference stops mattering. bud35 rows land on the current tree `7b0e3f8`+dirty(Lighting
cache only, if unswept) — check `git status` at read time and record what dirty meant.
