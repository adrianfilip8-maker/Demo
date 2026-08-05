# PREREG — mradius: the §24.3 hero kerb band's moulding-radius arm, sealed before any frame

Written 2026-08-05 by the GEOMETRY agent (fresh spawn, briefed from committed files only),
offline: no captures, no lock tickets, no `src/**` edits. Src tree at seal:
`3be168ae28832f69` (first 16 hex of `find src -name '*.js' -type f | sort | xargs sha256sum |
sha256sum` from the repo root — relative paths; the convention matters, §160-era hashing
hazard). Every number below is measured this session by
`progress/records/mradius-proj.mjs` (committed beside this file; run it — exit 0 means every
source anchor holds and both committed counts reproduce) or is a citation with its section.

**Arming record.** The hullkerb seal's R2 gate (PREREG-hullkerb §3.3, RESULT-hullkerb R2)
measured the band LIVE on this tree: kerbband2 non-causal on the committed hero base
**n = 1,708** (≥ the registered 850 line), 4× ROI crop confirming the continuous cyan bar.
Per that seal, this arm exists only as its own prereg containing three registered
requirements: **(i)** a retention condition on the intended key-catch arris line, **(ii)** a
radius→0 hard-edge known-bad as the §13 calibration arm, **(iii)** the §17/§24.3 look-change
declaration. §6 discharges each by name.

---

## 1. What the band actually is on THIS tree — the identification, corrected before the lever

The ledger's standing identification is **stale, and acting on it would have spent the
window on a no-op.** NOTE-task20-verification.md filed the band's geometry as "the obelisk
terrace stage-2 deck rim"; the §24.3-era reading of that is the deck slab's chamfer
(`EgyptLevel.js:365`, `paving_courtyard`, `c: 0.09`). Re-derived against the current tree
(§18: re-derive, don't transcribe), that slab's 45° bevel strip is **backfacing from hero's
camera** (facet normal (0, .707, −.707) against a view ray descending ~22°) and its arris
projects 3–4 px BELOW the measured band. **Cutting `c` at `:365`/`:352` would not move one
band pixel.** Those constants stay untouched.

**The band is the tc2 cornice ring top** — the walkable fillet annulus of
`K.cornice({h:0.56, flare:0.36, roll:0.18})` at `EgyptLevel.js:363–364`, material
`sandstone_worn`, wall plane z = 5.35, top flush with the deck at y = 5.20, running
**A = flare + 0.22 = 0.58 m** proud of the wall plane to the fillet outer arris
(`corniceProfile`, `Kit.js:1137–1163`). Three independent confirmations, all in
`mradius-proj.mjs`'s output:

1. **Projection**: at every probe column (860/900/940/980/1020) the measured artefact
   pixels sit between the projected wall-plane and fillet-arris rows, centre out
   0.30–0.32 m of A = 0.58 — inside the annulus to ±1.5 px, five for five.
2. **The shader's own note** (`toon.glsl.js:721-722`): "hero's worn step lip at px
   (832-1056,500-620), a ~1453 px cyan band on **arch:sandstone_worn** INSIDE cast shadow."
   The cornice is sandstone_worn; the deck slab is paving_courtyard.
3. **Mechanism**: `sweep()` (`Kit.js:995`) is indexed — "normals average along the profile"
   — so the fillet arris corner `[flare+0.22, top+0.34]` carries an area-weighted average of
   the top-annulus and draft-face normals (**tilt 24.4°** outward, computed), and that turn
   is interpolated across the ENTIRE 0.58 m annulus. The surface fresnel (uRimPower 3.1,
   rimBand smoothstep(0.26,0.58)) selects the tilt window where ndv falls toward
   self-occlusion: modelled onset 1.3–8.5° (wrap-dependent), self-occlusion 22.7°; the
   measured band spans 8.1–18.1° in tilt terms — inside the modelled window, outer tail
   trimmed by the L≥150 luma cut. Both rim gates pass it **correctly** (the normal genuinely
   turns, convex) — §24.3's own wording, now with the turning surface named.

**So the "moulding radius" of §24.3 ("the band's world width scales with the moulding
radius") is real but currently degenerate:** the fillet arris has no explicit radius — its
rounding is a smoothing artefact smeared across the full 0.58 m (tc2) / 0.62 m (tc1)
annulus. That smear width IS the radius lever.

## 2. Instrument and calibration, re-run on this container before anything is quoted

- `kerbband2.mjs` calibration: rim2 causal **1,691 EXACT** (target 1,691 ± 2), lift p50
  **110.9 L** — the frozen definition reproduces the committed record on this container.
- `mradius-proj.mjs`: **all source anchors hold** (hero camera, applyShot semantics, L
  terrace, tc1/tc2 params + material, deck vol as the recorded non-lever, corniceProfile
  top rows, sweep indexing, rng-neutrality of corniceProfile/cornice/sweep, TUNE rim
  constants, rimBand form, the glsl siting note, sun/moon track rows, night camera), and
  both committed counts reproduce: rim2 causal 1,691, live hero base non-causal **1,708**.
- Frames used, provenance: `shots/rim2/hero-{base,norim}.png` (Aug 2 committed causal pair)
  and `progress/records/hullkerb/frames/{hero,night}-base.png` (this session's landed
  capture, committed). §122.1 convention: every count in this file is the frozen kerbband2
  artefact class (`L≥150 ∧ B>R ∧ B−R≥18 ∧ B≥G−4`, causal adds lift ≥ 8) in ROI
  x 820..1100 y 500..610 on 1280×720 — no other pixel statistic below has a threshold to
  state because none is used as a gate.

## 3. The change: an explicit turn-zone width on the cornice arris, opt-in per call site

`corniceProfile` (`Kit.js:1137`) gains one opt-in parameter, **`arrisBand`** (default
`null`), forwarded by `cornice()`:

- `null` — emit today's profile array exactly: **bit-identical geometry for every caller.**
- `s > 0` — insert ONE coplanar profile row at `[A − s, top + 0.34]` (A = flare + 0.22).
  Indexed smoothing then puts pure +y normals on the inner annulus (both rows flat →
  planar → the magnitude gate closes it, same as the deck top) and confines the 0→24.4°
  interpolated turn to the outer **s metres**. The arris row's own summed normal is
  unchanged (same adjacent face planes), so the draft face and everything below shade
  identically.
- `s = 0` — duplicate the arris row so normals split: **hard edge**, the radius→0 KB.

Facts that make this the cleanest possible A/B, each verified in `mradius-proj.mjs` or by
construction from the read source:

- **Stream-neutral**: `corniceProfile`/`cornice`/`sweep` draw nothing from the shared rng
  (regex-guarded) — every arm reshuffles no block jitter anywhere in the level.
- **Silhouette-invariant**: the inserted row is ON the existing top plane; no vertex
  position anywhere moves. All deltas are shading-normal deltas inside the treated annuli.
- **§8.1 contracts unmoved**: collision is proxy-based; the walkable top plane, the z0
  ledge proxy, and every deck y are untouched. NOTE-task20's "do not delete that geometry"
  is honoured — nothing is deleted, one row is added.
- **Cost**: ≤ +150 tris total (surface row + caps + back-plane row-for-row across 4 runs ×
  2 cornices), **+0 draws** (merged). Counted-column deltas are printed per arm and used
  arm-to-arm only, never against 250/1.2 M (§153.1).
- **Treated call sites: exactly two** — `tc1` (`EgyptLevel.js:350`) and `tc2` (`:363`), the
  two terrace kerbs. The other eight cornices in the level keep `null` and stay
  bit-identical; §146.4's temple chamferBox arrises are different primitives on different
  meshes and are outside the blast radius **by construction**, not by hope.

## 4. Candidate choice — registered here, with the numbers that chose it

From `mradius-proj.mjs` §D (base n = 1,708; screen figures at hero probe columns
860/940/1020; "zone" = full visible turn zone, "core" = artefact-class core):

| arm | s (tc2 / tc1) | band world width | zone px | core px | predicted n |
|---|---|---|---|---|---|
| current | 0.580 / 0.620 m | 0.238 m | 14.7–16.5 | 7.0–8.0 | 1,708 |
| −25 % | 0.435 / 0.465 m | 0.178 m | 11.1–12.3 | 5.3–6.0 | 1,281 |
| **−40 % (CAND)** | **0.348 / 0.372 m** | **0.143 m** | **8.8–9.9** | **4.2–4.8** | **1,025** |
| radius→0 (KB) | 0 | 0 | 0 | 0 | ≤ 400, exp ≤ 170 |

**The candidate is −40 %** (`arrisBand = 0.60 × A`: tc2 **0.348 m**, tc1 **0.372 m**):

- −25 % moves the visible zone 15.6 → 11.7 px at the decisive column — a change near the
  JND for a soft band; spending a contended window on it risks an honest "cannot tell".
- −40 % moves it 15.6 → 9.4 px (core 7 → 4.2) — a readable narrowing — while the confined
  turn zone (34.8 cm) stays ABOVE the healthy range for this vocabulary:
  `corniceProfile`'s own header puts the wire failure at a 6.2 cm crest and the intended
  read at 14–22 cm crests (rolls 0.30–0.46). 34.8 cm is not within a factor of 5 of the
  measured wire. Going deeper than −40 % is not registered and is not licensed by this
  file.
- The goal is NOT band = 0. Courtyard's §24.4 finding is the standard: an edge-shaped rim
  on an edge is the FEATURE. The target state is the band moving toward that read while
  remaining the rounded kerb §7.3's vocabulary asks for.

## 5. Registered predictions and falsifiers — falsifiers revert, not defend

Arms per shot, one boot per chunk, in order: **base → cand → kb → restore** (tree-edit +
re-navigate per arm; §7). All counts by `kerbband2.mjs` run per landed hero frame.

- **P1 (boot liveness)** — hero `base`: n ∈ **[1,674, 1,742]** (±2 % of 1,708) AND the 4×
  ROI crop shows the familiar continuous band. Outside → the boot is not measuring the
  sealed thing (tree moved / framing drifted): **VOID, nothing else is read.**
- **P2 (toggle hygiene)** — hero/night/courtyard `restore` vs `base`: differing px form the
  TEMPORAL MASK (combatrim standard). VOID for a shot if the mask exceeds 3 % of frame.
  **ROI ∩ mask must be 0 px** for hero counts to stand; mask size and cluster locations
  reported per shot.
- **P3 (confinement, mechanism check)** — per treated arm vs base, outside the temporal
  mask: changed px confined to the two cornices' projected annulus regions **+ a 6 px
  bloom/AA dilation**; **zero silhouette-edge movement** (positions are coplanar by
  construction — any moved silhouette = the mechanism did something other than designed:
  **VOID + revert**, not a result). `courtyard` is the dedicated confinement guard: its
  treated annuli are edge-on slivers (camera y 4.0 sits below the stage-2 deck plane), so
  its prediction is **~0 diff px**; a large courtyard diff is P3 failure regardless of how
  hero looks.
- **P4 (the question)** — hero `cand`: **n ∈ [769, 1,281]**, point 1,025 (count ∝ s, the
  one modelled claim; the ±0.15 ratio band absorbs bloom's fixed-px share growing as the
  band narrows, AA at the window edges, and §158.5-class framing drift). AND the 4× ROI
  crops (base beside cand, same coords): the band visibly narrowed (~15.6 → ~9.4 px zone at
  col 940), still ONE clean continuous band — no doubling, no new hairline, no break at the
  NE corner (registered corner crop). **n inside the band with a dirty crop is a FAIL; a
  clean crop with n outside the band is a FAIL** — the second is the linearity model
  refuted, and the honest outcome is revert + record the measured scaling for any future
  prereg, not a defence of the arm (§133.1: the interval IS the claim).
- **P5 (the §13 calibration arm)** — hero `kb` MUST read as its own failure. Expected
  signature, all three required:
  (a) **n ≤ 400** (expected ≤ 170 — 400 covers the crawl hairline itself passing the
      artefact class at 1–2 px over ~240 columns) and no continuous ≥ 4 px pale-cyan bar
      anywhere in the ROI at 4×;
  (b) the previously-soft ~15 px gradient collapses to a 1–2 px hard shading transition
      showing the raster staircase along the arris (**grazing crawl**), possibly plus a new
      thin screen-space/PostFX edge line on the now-discontinuous normals — either dress of
      hard-edge is the failure reading;
  (c) the night deck-edge traces (P6 sites) dead or gutted.
  If `kb` is instead indistinguishable from `cand` at the registered crops, the viewing
  condition cannot score this question: **UNSCOREABLE (§141) — revert, no ship, no
  re-threshold.** KB never ships under any outcome.
- **P6 (retention — registered condition (i))** — `night`, the measured beneficiary
  (`toon.glsl.js:719`: "base traces every deck edge that norim loses"; those deck edges ARE
  the treated annuli). Sites located on the committed night-base, quoted from
  `mradius-proj.mjs`:
  - tc2 north run: trace peak **L 136**, bbox **(414,400)..(660,430)**
  - tc2 south run: trace peak **L 144**, bbox **(1170,449)..(1268,485)**
  - tc2 west run: trace peak **L 132**, bbox **(450,457)..(516,477)**
  Gate: in `cand`, each of the three traces remains a **continuous lifted line** at its
  site (thinner is the prediction, ~×0.6; side-by-side crops at 3×, base beside cand);
  in `kb` they die (feeding P5c). Any trace lost at `cand` → **FAIL, revert** — that is
  the §24.3 trap arriving through the floor's beneficiary, and no hero improvement buys
  it back. (Sly stands frozen mid-frame in night; he is arm-invariant and cancels in the
  side-by-side.)
- **P7 (price sanity)** — counted column, arm-to-arm only: cand/kb ≤ +150 tris, +0 draws
  vs base; restore delta 0/0. Never quoted against 250/1.2 M.

**Ship rule (registered):** ACCEPT — the Kit param + the two call-site `arrisBand` values
ship as the new look — **iff P1, P2, P3, P7 clean AND P4 passes both halves AND P5 reads
as failure AND P6 passes all three sites.** Anything else: revert every arm byte-exactly,
record the numbers, close this arm as *measured, not shipped*; a different s is a
different prereg. There is no tune-in-place outcome.

## 6. The three §3.3 registered requirements, discharged by name

- **(i) Retention on the intended key-catch arris line** → P6. One honest correction is
  part of this discharge: the seal's pointer "§146.3's verified feature" reaches the §146
  cel-ramp delivery ("in `temple` the chamfered arrises visibly catch the key as bright
  lines" — the sentence lives at §146.4; §146.3 is the adjacent Task-#28 heading). Those
  temple arrises are `chamferBox` work and are **untouched by construction** here (§3).
  The treated meshes' own intended edge-light features are what retention can honestly
  gate: the night deck-edge traces, measured at three committed-coordinate sites — plus
  the daylight equivalent noted as absent-in-frame: the hero west rim reads max
  **L 77–84** across its annulus in the committed base (peristyle cast shadow at tod
  0.79) — no lit line exists there to retain, so no condition is invented on it.
- **(ii) The radius→0 hard-edge known-bad as the §13 calibration arm** → the `kb` arm and
  P5, with the expected failure signature stated in advance (band gone AS A BAND, crawl
  appears, traces die) and the §141 UNSCOREABLE outcome wired to it.
- **(iii) The §17/§24.3 look-change declaration** →

  **DECLARED: this is a look change, not a correctness fix.** The base image is not wrong
  — §24.3 measured that every rim gate passes this band *correctly*; what changes is the
  most deliberate edge treatment in the level: the terrace kerbs' cornice rounding, the
  same cavetto/roll vocabulary the §146-era work shipped, tightening from a 0.58/0.62 m
  smeared curl to a 0.348/0.372 m confined curl on exactly two meshes. On ACCEPT: hero's
  kerb band narrows ~40 % (that is the point), night's deck-edge traces thin by the same
  fraction (P6 verifies they survive), the other eight cornices and every chamfered arris
  in the level are bit-identical. §157.4's precedent is followed to the letter: a look
  change to visible architecture ships only through this pre-registered A/B, scored
  blind-order crops beside a calibrated known-bad, with the character retention question
  structurally out of scope (no character material or shader term is touched — the §24.3
  trap's lever, uRimPower/rim strength, is exactly what this arm does NOT move).

## 7. Capture plan — chunked per §164.1, sized for the ~45-minute rollback cadence

**No capture is scheduled by this file.** When the coordinator green-lights, the capture
agent derives `mradius-run.mjs` from the tuftbias harness pattern (per-arm `srcAtArm`
stamps, `srcTree` naming discipline, arm grouping, quiet-tree settle before arm A — that
file's §160.5-era fixes are the spec), with these properties:

- **Arms are tree states, not uniforms**: base (pristine), cand (Kit param + two call-site
  values), kb (call sites at 0), restore (pristine bytes; sha256-verified against a
  pre-run snapshot before ticket release). The harness **navigates per arm** — §124.4's
  mid-run-edit amnesty does NOT apply (tuftbias precedent); every edit happens only inside
  the held ticket, and `srcAtArm` is stamped per arm.
- **Chunks** (whole registered comparisons per boot; frames + `arms.json` + kerbband2
  counts committed per chunk to `progress/records/mradius/` before the next chunk):
  | chunk | shot | arms | frames | scores it lands |
  |---|---|---|---|---|
  | 1 | `hero` (decisive) | base→cand→kb→restore | 4 | P1, P2(hero), P3(hero), P4, P5a/b, P7 |
  | 2 | `night` (retention) | base→cand→kb→restore | 4 | P2(night), P3(night), P5c, P6 |
  | 3 | `courtyard` (confinement) | base→cand→kb→restore | 4 | P2(court), P3's guard |
  Chunk order is decisive-first on purpose: if the cadence kills the run after chunk 1,
  P4/P5 already exist committed.
- Lock: FIFO ticket via `tools/lock.mjs` (never hand-created files in `/tmp/sands-of-ra/`);
  after any rollback, sweep the queue against `/proc` before believing it busy (§140.2).
  Launch detached via `tools/launch.sh` only (ppid-1 proof; §14's recipe is struck).
- Scoring: at the first wake after DONE, before anything else (§163.2), from committed
  files only. Crops published with the verdict: per-arm 4× ROI (hero), 4× NE-corner
  (hero base/cand/kb), 3× per-site night traces (base/cand/kb), courtyard diff mask.
  No adjective in the verdict is load-bearing without its number or its crop.

## 8. Files (for the coordinator's sweep — no git was run by this agent)

| file | state | what |
|---|---|---|
| `progress/records/mradius-proj.mjs` | NEW, committed-ready | the offline projection instrument; exit 0 = anchors + both counts reproduce |
| `progress/records/PREREG-mradius.md` | NEW, committed-ready | this seal |
| `src/**` | untouched | the change ships only via §5's ship rule, edits only inside the capture ticket |
| `progress/records/mradius/` | created at capture time | frames, arms.json, counts, crops, RESULT |

Scratchpad-only exploration scripts were not committed. The deck-slab chamfer constants
(`EgyptLevel.js:352`, `:365`, `c: 0.09`) are explicitly NOT part of this arm — recorded in
§1 so the stale identification cannot re-route a future owner to a no-op.
