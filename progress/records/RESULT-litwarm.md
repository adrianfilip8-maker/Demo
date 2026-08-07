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

## Day chunks A–E (r11, runner pid 25698, log `logs/litwarm1-r11.log`) — complete, ALL DONE at +2132s

Per-chunk discipline held end-to-end: P-F7 live `nightAmount` **0 exactly** on every day shot,
`uSss` shader readback **exact** at 0 / 0.3 / 0 in every chunk, per-chunk revert verified
(`litwarm-arms.py check` = BASE after exit), and the per-chunk `srcTree after` "MOVED" flags are
the runner's own cand install measured before its revert — after-hash `9f06ac30` identical in all
chunks, at-lock hash `1721f591` (base) every time, **no third value anywhere ⇒ no foreign drift**.

## score3 — the committed scorer on the completed capture, table verbatim

```
banda-diag — drift guard PASS (49 constants + 29 load-bearing lines asserted against committed source)

═══ score3 — PREREG-litwarm quantities on progress/records/litwarm1 (BANDS_LW verbatim from the seal) ═══
  P7-fw night Δpx (frame-wide)       0.00  band [0,0]  PASS
  P-F4 night restore px              0.00  band [0,0]  PASS
  P7-g guard Δpx (frame-wide)        0.00  band [0,0]  PASS
  P-F4 guard restore px              0.00  band [0,0]  PASS
  BaseGate hero frame warm%          22.78  band [21,26]  PASS
  W1 hero frame warm% Δpp            2.38  band [0.3,8]  PASS
    (warm% 22.78 → 25.16; comparand quoted in the seal, not claimed)
  H hero frame Δ(R−B) L40-140 fixed  2.26  band [0,30]  PASS
    (mask n 657874 = 71.38% of frame — the fixed mask, base arm)
  S1 hero shade Δ(R−B) L<40 fixed    1.83  band [0,20]  PASS
  P-F4 hero restore px               0.00  band [0,0]  PASS
  P-F9 hero KBnull px                0.00  band [0,0]  PASS
  BaseGate courtyard frame warm%     24.87  band [31,37]  FAIL
  W2 courtyard frame warm% Δpp       1.83  band [0.3,8]  PASS
    (warm% 24.87 → 26.70)
  H courtyard frame Δ(R−B) L40-140 fixed 2.89  band [0,30]  PASS
  S1 courtyard shade Δ(R−B) L<40 fixed 1.12  band [0,20]  PASS
  P-F4 courtyard restore px          0.00  band [0,0]  PASS
  BaseGate temple frame warm%        17.11  band [16,21]  PASS
  W3 temple frame warm% Δpp          0.11  band [0,10]  PASS
  H temple frame Δ(R−B) L40-140 fixed 0.14  band [0,30]  PASS
  S1 temple shade Δ(R−B) L<40 fixed  0.02  band [0,20]  PASS
  P-F4 temple restore px             0.00  band [0,0]  PASS
  BaseGate interior frame warm%      7.11  band [5.5,9]  PASS
  W4 interior frame warm% Δpp        0.00  band [0,12]  PASS
  H interior frame Δ(R−B) L40-140 fixed 0.00  band [0,30]  PASS
  S1 interior shade Δ(R−B) L<40 fixed 0.00  band [0,20]  PASS
  P-F4 interior restore px           0.00  band [0,0]  PASS
  BaseGate hero.arch <L40 %          35.19  band [30,41]  PASS
  H5 hero.arch Δ(R−B) L80-140 fixed  1.57  band [0,45]  PASS
  S2 hero.arch Δ<L40 pp              -1.22  band [-12,0]  PASS
  S3 hero.arch body hue (C)          218.30  band [200,246]  PASS
  H6 temple.col Δ(R−B) L80-140 fixed 1.43  band [0,45]  PASS
  S3 temple.col body hue (C)         207.00  band [200,246]  PASS
  S3 interior wall0 body hue (C)     225.00  band [200,246]  PASS
  S3 interior wall1 body hue (C)     225.00  band [200,246]  PASS
  KB-overwrap hero body hue 218.71 (fires below 200) — DID NOT FIRE
  KB-overwrap interior body hue 225.00 (fires below 200) — DID NOT FIRE
  KB-overwrap rects fired            0.00  band [1,99]  FAIL
  S5 sly subject-interior Δpx        0.00  band [0,0]  PASS
  S4 creamROI b−r (C)                -28.00  band [-58,-30]  FAIL
  S4 rings b−r (C)                   7.00  band [5,45]  PASS
  S4 tail body R−B (C)               -8.62  band [-4,18]  FAIL
  P-F4 sly-closeup restore px        0.00  band [0,0]  PASS
  T1 traversal contrast Δ            -1.39  band [-0.5,5]  FAIL
    (fig−sur 11.89 → 10.50; banda2 already took 2.46 — NOTE-traversal-contrast.md)
    traversal frame Δ(R−B) L40-140 fixed = 5.31 (REPORT-ONLY, not registered)
  P-F4 traversal restore px          0.00  band [0,0]  PASS

  41 scored, 5 FAIL — RESULT-litwarm quotes this table verbatim.
```

## Verdict — each falsifier's registered text quoted before any reasoning (§193.1)

**P-F3, verbatim:** *"a base gate outside ⇒ capture **VOID** (the tree/staging is not the
diagnosed one)."* — Base gate `courtyard frame warm% ∈ [31, 37]` measured **24.87**. Outside.
**P-F3 FIRES ⇒ the capture is VOID.**

**P-F2, verbatim:** *"a KB arm fails to read as its own failure ⇒ **UNSCOREABLE**"*; §5:
*"**Either KB failing to read as its own failure ⇒ UNSCOREABLE (P-F2)** — no verdict either
way."* — KB-overwrap fired on **0 of 2** registered rects (hero body hue 218.71, interior 225.00;
the registered fire is < 200). **P-F2 FIRES ⇒ UNSCOREABLE — no verdict either way.**

**P-F1, verbatim:** *"any gated band (W1–W4, H1–H6, S1–S5, T1) outside on the `C` arm ⇒
**candidate REVERTED**. No post-hoc retune toward a band; a different value is a different
prereg."* — Three gated bands are outside on C: S4 creamROI **−28.00** ∉ [−58,−30], S4 tail
**−8.62** ∉ [−4,+18], T1 **−1.39** ∉ [−0.5,+5]. On a VOID + UNSCOREABLE capture these attach no
conviction to the lever — but they are recorded, because any v2 must face them.

**P-F8, verbatim:** *"If **W1 < +0.3 AND W2 < +0.3** … the lever is **REVERTED and the finding
recorded**."* — W1 = **+2.38**, W2 = **+1.83**, both ≥ +0.3. **P-F8 does NOT fire: the
near-terminator population is real**, the one quantity the seal said it could not measure offline.

**P-F5, verbatim:** *"**S1 negative on any day shot** ⇒ FAIL and revert."* — S1 = +1.83 / +1.12 /
+0.02 / +0.00; never negative. Clean: the term is additive-only, as constructed.

**P-F6, verbatim:** *"P7-fw ≠ 0 or P7-g ≠ 0 ⇒ **the candidate does not ship on this seal**."* —
Both **0 exactly**, frame-wide. The §3 night arithmetic (five steps, IEEE754) held on screen.

P-F4 = 0 px on **all seven** chunks; P-F9 (KBnull) = 0 px; S5 subject-interior = 0 px (the
enumeration did not leak onto the character); P-F7 exact on every chunk. The instrument and the
runner did everything the seal asked, exactly.

## Why the tree is not the diagnosed one — the fires attributed, each to a mechanism

1. **The §196 character ship (`59c1f6b`) sits between the seal and the capture.** Sealed
   2026-08-06 on sbs3/banda2-era frames with the incumbent character; captured 2026-08-07 with
   `SlyModel3` as the default. Direct evidence in the table itself: **T1's base fig−sur is 11.89
   where the seal recorded 3.41** — the traversal figure rect now contains the rebuild, which
   raised figure contrast ~3.5× on its own. **S4's rects are incumbent-character pixel
   rectangles** (cream muzzle b−r, tail-body R−B [−4,+18] sized on the incumbent's grey-brown
   tail); the rebuild's muzzle geometry and `tailDark 0x5e5c55` sit differently in those same
   rects. Both S4 misses and the T1 base shift are the shipped character, not the wrap.
2. **The staging path crosses the §195 phase lottery.** `litwarm1.mjs:186` stages via
   `setShot(n)` with no `dt`, so each boot's staging advances the world clock 17 live-dt frames —
   fine *within* a chunk (arms are pokes on one staged boot, `step(1,0)` between arms; that is
   why every P-F4/P-F9/S5/P7 is exactly 0), but the **base-gate comparison is cross-boot,
   cross-era, cross-phase**. Courtyard, the shot with the most cloud/shaft variability, is 8.9 pp
   below its sbs3-era gate while hero/temple/interior/hero.arch all hold within ~1 pp — a
   shot-specific staging/era shift, exactly what P-F3 exists to catch.
3. **The KB calibration was sized at cell scale, measured at rect-median scale.** The port
   predicted 0.45 drives *touched cells* to hue 6–17; the registered fire was the **rect body
   hue** (median) crossing below 200. The rect medians are dominated by cast-shadowed and
   far-past-terminator pixels the wrap cannot touch (by construction), so KBover moved hero's
   body hue by ~0.4°. The instrument cannot see the failure mode it was registered to see at
   this population share — P-F8's own stated doubt, landing on the KB instead of the W bands.

## Findings that survive (report-only — a VOID capture grounds no ship, but these are measured)

- **The night discipline is exact end-to-end**: P7-fw = P7-g = 0 frame-wide, 7× restore = 0,
  KBnull = 0, subject-interior = 0. The shipped-gate-measured-live pattern (§154.5 amendment)
  worked on its first outing.
- **The population exists but is modest on this geometry**: hero +2.38 pp warm, courtyard
  +1.83 pp, H1 +2.26 R−B frame-wide — real, above P-F8's floor, well under the seal's ≈ +3 pp
  centre. Interior is **0.00 across all three metrics**: its visible architecture is either fully
  lit or cast-shadowed; the wrap's population there is empty.
- **T1's cost is real in sign**: the wrap brightens traversal's surround (+5.31 R−B frame
  report-only) and takes 1.39 L of figure−surround contrast — but from a base of 11.89, not the
  3.41 the band was sized to protect. The scarcity that motivated [−0.5, +5.0] no longer exists.

## Decision

**The capture is VOID (P-F3) and UNSCOREABLE (P-F2). The candidate does not ship on this seal.**
It is not installed — `litwarm-arms.py check` reads BASE on both files after the runner's exit —
and no conviction attaches either. Per P-F1's own text, no band is retuned toward a seen number.

**Disposition: litwarm v2 is DEFERRED behind the staging2 §195.4 re-seal**, which gates two
queued decisions (guard-camera west, a4 cone) against this one lever's ≈ +2 pp. A v2, if taken
up, must: stage both eras at `dt: 0` (the §195 fix charab already carries); re-derive base gates
on current-tree frames; re-rect S4 on the shipped rebuild; register a KB whose fire is measured
at the scale the instrument reads (or a cell-scale instrument); and re-derive T1 from the
current base **with the §141.1 hazard stated out loud** — we have seen C land at −1.39, so any
re-derivation that flips that number to PASS must be defended from base-side principle alone or
not made at all.

**The lit-palette gap itself stays routed per §1.5** — it does not close with this lever at any
value: lit-area coverage → LIGHTING/GEOMETRY, the luma-scoped warm/cool split → POSTFX
(`splitRange`/`splitStrength`/`splitHighlight`), the §2.2 shadow-hue direction → coordinator and
the blind critic, with `banda-diag.mjs lit` giving each its scale.

## Files (coordinator sweep list — no git run by this task)

- `progress/records/PREREG-litwarm.md` — the seal (+ the pre-boot amendment at its own site).
- `progress/records/NOTE-traversal-contrast.md` — the regression attribution + the luma-bin hazard.
- `progress/records/banda-diag.mjs` — extended: `lit` mode, `score3`, re-based drift guard.
- `progress/records/litwarm1.mjs` — the runner (committed before the capture).
- `progress/records/litwarm1/` — frames + `readback-*.json`, per chunk.
- `progress/records/logs/litwarm1.log` — the capture log (launch.sh, pid 19148, ppid 1 verified).
- `progress/records/RESULT-litwarm.md` — this file.
- `src/render/ToonMaterial.js`, `src/world/Architecture.js` — the ship shape above.
