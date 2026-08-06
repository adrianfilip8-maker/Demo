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

**STATUS: IN PROGRESS — capture launched 2026-08-06 03:53 UTC. Night half SETTLED (P7-fw, P7-g,
P-F4, P-F7 all pass on chunks N/N2); day chunks A–E pending the capture lock.**

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

### The population — P-F7 half 1, clean on the first boot

Boot 03:53:24, srcTree `85bab2d30f5f7b59`, enumeration at +115 s:

```
pinnedCount 13
pinnedNames  arch:paving_courtyard, arch:gold_leaf, arch:column_papyrus, arch:sandstone_worn,
             arch:sandstone_block, arch:granite_pink, arch:limestone_polished,
             arch:hieroglyph_gilded, arch:hieroglyph_wall, arch:mudbrick, arch:ceiling_stars,
             arch:bronze_dark, arch:rope_fibre
pinnedSss    [0.3 × 13]        pinnedNightPin [0 × 13]
pinnedInArch 13/13             pinnedOnSkinned []
```

Every one of the three clauses passes on its own evidence: **13 ≥ 4** enrolled; **13/13** are
reachable from ARCHITECTURE's own scene subtree (the cross-check, which the amendment said would
be reported rather than fatal — it did not need the licence); and the **exhaustive scene-wide
`isSkinnedMesh` test returns an empty list**, so no material the ship would not touch is being
poked. Every name carries the `arch:` prefix. This is the check the seal's P-F7 was written for
and it is answered by enumeration, not by a count.

**One scope fact worth stating before any number is read:** the enrolled set is *all* of
ARCHITECTURE's recipes, which includes `gold_leaf`, `hieroglyph_gilded` and `bronze_dark`. The
wrap is added **outside** `diff`, so it is not attenuated by `diff *= mix(1.0, 0.20, slyMetal)` —
gilded surfaces receive it at full strength. That is inside this seal's declared scope (§7 says
"every architecture surface"), it is not a separate lever, and it is **not** credited to the
gold-renders-dark family unless a gold-specific quantity is registered by whoever owns that.

### Scorer correction, made while the capture was still on chunk N (recorded, not silent)

`score3` as first committed scored a **traversal `H` row** (frame Δ(R−B) on the L40–140 fixed
mask) as a gated quantity. **The seal registers `H` rows on hero / courtyard / temple / interior
only**; traversal carries `T1` and nothing else. That row was therefore a gate the seal never
registered, inflating the scored tally with an invented line — the exact thing the seal's own
"BANDS_LW duplicates §5, a mismatch voids the scoring" clause exists to prevent.

It is now **REPORT-ONLY**. The correction is **strictly conservative** (it removes a gate rather
than adding or loosening one), and it was made **before any traversal frame existed** — chunk E is
last in the plan, and at the time of the edit only `readback-N.json` was on disk. No registered
band moved, and no scored value changed. Stated here rather than quietly fixed because a scorer
edited during a capture is exactly the kind of thing that has to be visible.

### The night claim — P7-fw and P7-g both [0,0], settled on the real shipped gate

Chunks `N` (night, 03:53:24 → 04:05:47) and `N2` (guard), both srcTree `85bab2d30f5f7b59`
**before and after** — no tree drift inside either chunk (§165).

| registered | band | measured | |
|---|---|---|---|
| **P7-fw** | [0, 0] | **0** | `night.C.png` ≡ `night.base.png`, md5 `5e09765e84e6a8c0…` |
| **P7-g** | [0, 0] | **0** | `guard.C.png` ≡ `guard.base.png`, md5 `d0607fc25f93ef7d…` |
| **P-F4** | [0, 0] | **0** | `restore` byte-identical to `base` on both chunks |

The frames are **byte-identical**, which is strictly stronger than the registered band: [0,0]
differing px was registered at ΣRGB ≥ 4, and byte-identity gives 0 differing px at *any*
threshold. **P-F6 does not fire.**

**The discrimination that makes this a pass rather than a null.** Bit-identity is also what a
candidate that never reached the screen would produce, so it is only evidence if `sss 0.30` was
genuinely live on the `C` arm. The readback separates the two cleanly:

```
C arm:  slySss [0.3 × 13]   uSss [0 × 13]   nightPin [0 × 13]   nightAmount 1   mismatch []
```

`slySss` is the material's **declared** value — 0.30, so the candidate was installed and live —
while `uSss` is the **published** uniform, pinned to 0 by the gate. That is §3's arithmetic
(`a + (b − a) · 1.0 = b = sssNightPin = 0.0`) observed on the real shipped code path, not on a
poke standing in for it. The runner registered `expectedUSss: 0` ahead of the read and returned
`mismatch: []`. A never-installed candidate would have shown `slySss 0`; it does not.

**P-F7, half 2 — passes on both chunks.** `nightAmount = 1` **exactly** at `night` and at `guard`;
`pinnedCount 13` (≥ 4); `pinnedOnSkinned []` against `skinMatCount 16`, so the exhaustive
scene-wide test enrolled none of them; `pinnedInArch 13/13`; `hasPublish` and `hasInkNight` both
true. Neither chunk is VOID.

**Cross-chunk comparability, checked rather than assumed.** The day chunks start on srcTree
`4c83af2068ab9936`, not the night chunks' `85bab2d3…`, which would ordinarily put the seal's
**absolute** bands (S3's [200,246] wall-body hue, S4's verbatim BANDS2 rows) at risk of being
compared across two different builds. The entire difference is **one commit, `0d543cf`, touching
`src/fx/Particles.js`, and both of its hunks are inside `/* */` comment blocks** (§187's comment
correction) — no executable line moved between the night chunks and the day chunks. The hash
moved; the build did not. The C-vs-base *difference* rows were never exposed to this in any case,
and P-F3's base gates remain the independent guard.

## Scores

**Night chunks, scored by the registered instrument** — `node banda-diag.mjs score3
progress/records/litwarm1`, verbatim:

```
banda-diag — drift guard PASS (49 constants + 29 load-bearing lines asserted against committed source)

═══ score3 — PREREG-litwarm quantities on progress/records/litwarm1 (BANDS_LW verbatim from the seal) ═══
  P7-fw night Δpx (frame-wide)       0.00  band [0,0]  PASS
  P-F4 night restore px              0.00  band [0,0]  PASS
  P7-g guard Δpx (frame-wide)        0.00  band [0,0]  PASS
  P-F4 guard restore px              0.00  band [0,0]  PASS

  4 scored, 0 FAIL — RESULT-litwarm quotes this table verbatim.
```

This is an **independent second method agreeing with the first**: the byte-identity result above
was reached by hashing the PNGs, and `score3` reaches [0,0] by decoding them and differencing at
ΣRGB ≥ 4 against `BANDS_LW`. Two different readings of the same frames, same answer.

**On the drift guard reading 29 load-bearing lines here where the capture logged 32** — checked
rather than waved through, because an instrument whose assertion count moves is exactly the kind
of thing this ledger keeps finding to be meaningful. It is benign and by design. The guard
branches on `LITWARM_SHIPPED`: with the candidate in the tree it asserts four lines (the
`sssNightPin` option, the gate publish, the gate call site, the cache key); at base it asserts one
(`sss: 0.0,`, the pre-litwarm premise). 4 − 1 = 3, which is exactly the difference. The tree is at
base right now because the runner installs the candidate only inside the held lock, so the guard
is correctly reporting *which* tree it is describing instead of straddling two — and the pixel
scoring above does not depend on the current tree at all, since it reads committed PNGs.

_(day chunks A–E to follow)_

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
