# RESULT-litwarm — registered scoring of the litwarm capture (PREREG-litwarm.md)

Scored by SHADING, 2026-08-06, per `PREREG-litwarm.md` **exactly as sealed**, including the one
amendment logged at its own site before the capture booted (§6 P-F7's block: the dispatch ships
the candidate in src, so the arms poke backwards and the night gate under test is the real
shipped code path; the population is `shading._sssPinned` with an exhaustive scene-wide
SkinnedMesh test). Bands are quoted verbatim by the registered scorer
(`banda-diag.mjs score3`, **committed before the capture launched**; its `BANDS_LW` duplicates
the seal's §5 and a mismatch voids the scoring, not the seal).

**Written incrementally as chunks land (§163/§164); an abrupt end means a rollback took the
session, not that scoring stopped.**

**STATUS: IN PROGRESS — capture launched 2026-08-06 03:53 UTC.**

## Ship shape under test (applied inside the held ticket, per the dispatch)

| file | line | old → new |
|---|---|---|
| `src/world/Architecture.js` | 209 | `sss: 0.0,` → `sss: 0.30,` + new `sssNightPin: 0.0,` (**ARCHITECTURE's line**, applied on the coordinator's dispatch) |
| `src/render/ToonMaterial.js` | ~948 | new option `sssNightPin: clamp(num(opts.sssNightPin, num(opts.sss, TUNE.sss)), 0, 1)` — **defaults to `sss`**, so an undeclared caller is not enrolled and nothing is written per frame |
| `src/render/ToonMaterial.js` | ~987 | `o.key` gains `r3(o.sssNightPin)` — two materials differing only in pin must not alias in the cache |
| `src/render/ToonMaterial.js` | ~709 | new `this._sssPinned = []` |
| `src/render/ToonMaterial.js` | ~1085 | enrol on `o.sssNightPin !== o.sss`, and publish once at build so a material created at night is correct on its first frame |
| `src/render/ToonMaterial.js` | ~1296 | new `_publishSssPin(mat)` — writes `userData.slyUniforms.uSss`, lerped by `_inkNight` |
| `src/render/ToonMaterial.js` | ~1320 | the publish loop, in banda2's own `setKeyLight` `nightAmount` slot, one length check on a shipped frame |

Src tree at launch: `85bab2d30f5f7b59`. Instrument drift guard: **PASS, 49 constants + 32
load-bearing lines**, including the new assertions for the shipped shape (`sss 0.30`,
`sssNightPin 0.0`, the option, the publish line, the call site, the cache key) and — carried from
the diagnosis session — banda2's own gate publish line, which discharges RESULT-banda2's
ship-time obligation.

## Chunk log

_(filled per chunk as it lands)_

## Scores

_(the `score3` table, verbatim, at full capture)_

## Verdict

_(pending)_

## Files (coordinator sweep list — no git run by this task)

- `progress/records/PREREG-litwarm.md` — the seal (+ the pre-boot amendment at its own site).
- `progress/records/NOTE-traversal-contrast.md` — the regression attribution + the luma-bin hazard.
- `progress/records/banda-diag.mjs` — extended: `lit` mode, `score3`, re-based drift guard.
- `progress/records/litwarm1.mjs` — the runner (committed before the capture).
- `progress/records/litwarm1/` — frames + `readback-*.json`, per chunk.
- `progress/records/logs/litwarm1.log` — the capture log (launch.sh, pid 19148, ppid 1 verified).
- `progress/records/RESULT-litwarm.md` — this file.
- `src/render/ToonMaterial.js`, `src/world/Architecture.js` — the ship shape above.
