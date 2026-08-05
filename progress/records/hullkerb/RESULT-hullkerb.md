# RESULT — hullkerb: the gold-only prop hull (PREREG-hullkerb.md, sealed at 418bb93)

**STATUS: SCORED — VERDICT: ACCEPT. See the VERDICT block at the end of this file.**

Scored 2026-08-05 by the GEOMETRY scoring agent (fresh spawn at `d3c2fa1`, briefed from
committed files only, per §163.2's score-at-first-wake rule). Everything above the
"Courtyard scores" heading is the capture agent's incremental record, left as written;
the scoring agent verified its interior claims against the committed frames and crops
before relying on them.

Executed 2026-08-05 by the GEOMETRY capture agent (fresh spawn; briefed from committed files
only). Seal: `progress/records/PREREG-hullkerb.md`. Runner: `progress/records/propshull2.mjs`,
derived from `propshull.mjs` with exactly the three registered deltas (ink-material clone,
`hull3x` calibration arm, §2.5 ride-alongs).

## Pre-capture state, verified this session

- `src/` is byte-unchanged between the seal's tree `ed1667a` and HEAD `efef525`
  (`git diff --stat` empty for `src/`): the seal's anchors still describe this tree.
- `Props.js:135` is `const HULL_KEYS = new Set();` (dormant, as §155.4 left it); the gated
  call site at `:574–586` is intact.
- **Price re-derived on this tree**: `hullgold-price.mjs` → 6-key sum **55,718 EXACT** against
  the dead tool's record; **gold-only price +1 draw / +11,972 tris**. Against the SCORED
  main-view citation (71 draws / 0.572 M, §153.1): 72 / 250 draws (28.8 %), 0.584 M / 1.2 M
  (48.7 %). §1.2: 30 fps is claimed as licence for nothing here.
- **kerbband2 calibrated on this tree**: causal **1,691 PASS** (target 1,691 ± 2), lift p50
  **110.9 L** (= recorded 102.9 + 8). The frozen definition reproduces the committed record,
  so R2's count may be quoted. `bud` cross-check 1,680 (cross-check only, never a gate).
- Lock state at start: `/tmp/sands-of-ra/` queue empty, no `capture.lock`, fx22 complete
  (efef525 "all 13 jobs banked"). The runner queues FIFO via `tools/lock.mjs` regardless —
  if the CHARACTER capbill capture tickets first, this capture waits politely behind it.

## Capture plan (chunked per §164.1 — every registered comparison inside one boot)

| chunk | shots | arms | frames |
|---|---|---|---|
| 1 | `interior` (decisive) | base → base2 → hull → hull3x → restore | 5 |
| 2 | `courtyard` (collateral guard) | base → base2 → hull → hull3x → restore | 5 |
| 3 | `guard`, `night`, `hero` | base/hull pairs; hero base only | 5 |

The one-line edit `Props.js:135` `new Set()` → `new Set(['gold'])` is applied by the runner
ONLY inside its held ticket, per chunk, and reverted (byte-identity verified against a
pre-run snapshot) before each release. Frames land directly on this durable path
(`frames/`); `arms.json` is rewritten after every arm; srcTree stamped per arm (§160.5).

## Registered falsifiers (verbatim discipline — falsifiers revert, not defend)

- **P1** base vs base2 = 0 px, else VOID (threshold: any channel Δ > 0 — §122.1 convention).
- **P2** restore vs base = 0 px, else VOID.
- **P3** hull vs base confined to `props_gold` silhouette edges; zero changed px on surface
  interiors AND zero on the canopic jars (`lime`, now shell-less). Broad change = VOID + revert.
- **P4** the gilded Ra's sun disc regains the clean continuous dark ring §155.4 confirmed.
  Absent → VOID-AND-INVESTIGATE, not defended from the old record.
- **P5** on both decisive shots at 1:1 and 4× (Ra disc; the gold hook rings; gold at grazing
  angle): none of sticker edge / visible doubling against the PostFX line / grazing crawl —
  judged with `hull3x` beside as the calibrated known-bad and
  `crops/hull-obelisk-085-courtyard.png` as the sound-at-nearby-weight reference. If `hull`
  and `hull3x` are indistinguishable at the ROIs: **UNSCOREABLE** (§141) — revert, no ship.
- **Ship rule**: ACCEPT (line stays) iff P1–P4 clean AND P5 clean; any P5 condition → REJECT,
  revert, close the Task #28 lineage. No middle "tune the thickness" outcome.

## Ride-alongs (offline, no lock time)

- **R1** `kerbline.mjs` over guard/night base+hull. Reporting language fixed in advance:
  "signature present at (coords)" or "not located in the regions inspected" — never "not
  present in the frame" (the detector is width-blind, §152.3).
- **R2** `kerbband2.mjs` non-causal on hero base. Gate (registered-arbitrary, §133.1):
  n ≤ 170 AND 4× ROI crop shows no continuous cyan bar → referent C closes;
  170 < n < 850 → crops to coordinator; n ≥ 850 → radius arm gets its own prereg.

## Arms landed

(updated incrementally as chunks complete — see `arms.json` for the per-arm record)

- [x] chunk 1: interior — landed 05:45Z, adjudicated §165 (coordinator's Particles.js revert
      mid-run; base==base2==restore at ONE sha256 `6b3be800…`, chunk STANDS)
- [x] chunk 2: courtyard — **r1 (pid 25140) killed by the §167 rollback before its first
      frame** (`log-chunk2.txt` preserved as that record); **r2 (pid 11456) killed by the
      §168 rollback, also before its first frame** (`log-chunk2-r2.txt`, truncated at the
      same line). **r3 (pid 2983) landed it**, 08:45:55–08:57:43Z, log
      `progress/records/logs/hullkerb-c2r3.log`. Tree note (per seal P1/P2 wording,
      WITHIN-chunk comparisons): the committed tree has moved since chunk 1 — Particles.js
      revert (`1ef6ec0`) and the §166 capYaw ship in SlyModel.js (`03a71c4`) — so r3's
      srcAtArm stamps differ from chunk 1's `520bd541…`. Neither touches Props.js or world
      geometry; cross-chunk stamp drift does not void P1/P2, and the stamps are stated
      plainly below.
- [x] chunk 3: guard + night + hero — landed 09:23Z (pid 9915), log
      `progress/records/logs/hullkerb-c3.log`; same committed tree as chunk 2 r3.

## Interior scores (decisive shot)

- **P1 PASS** — base vs base2 **0 px** (threshold any-channel Δ>0); in fact base, base2 AND
  restore are sha256-identical.
- **P2 PASS** — base vs restore **0 px**.
- **P3** — hull vs base: 25,862 px (2.806 %), maxΔ 159, **entirely inside the gold objects'
  regions** (bbox x 612..993 y 53..487 = Ra statue + gilded chest + treasure pile; strong
  diff Δ≥16 is 7,249 px, bbox x 637..964 y 119..473). Amplitude structure: 58 % of changed
  px are Δ<8 (PostFX/bloom spill around the new lines, not surface repaints).
  **Canopic jars: 0 changed px** (ROI x 450..620 y 340..450, both hull AND hull3x —
  `roidiff.mjs`). Nothing on Sly, walls, floor, or any non-gold prop. Confined: **PASS**.
- **P4 PASS** — the Ra sun disc regains the clean continuous dark ring
  (`crops/int-radisc-{base,hull,hull3x}-4x.png`): in `base` the disc melts into the pale
  wall; in `hull` a single 2–3 px ring runs the full circumference.
- **P5 interior read** (1:1 + 4×, hull3x beside as known-bad; obelisk crop as reference):
  - Ra disc: single continuous ring, no sticker edge, no doubling. hull3x: fat ~7 px band
    swallowing the disc edge — the known-bad reads as known-bad, so the condition scores
    (§141 satisfied; hull vs hull3x differ by 33,238 px, unmistakable at every crop).
  - Gilded chest chunks: hull's line lands into the existing heavy PostFX stroke and reads
    as ONE slightly heavier line — no railroad doubling anywhere found at 4×.
  - Treasure pile (grazing, smallest gold): each coin gains an individual closed loop; at
    1:1 the pile reads as *coins* where base reads as pale speckle; no crawl smears. hull3x
    fuses the near cluster into one solid navy mass (total glitter kill) — hull is far from
    the failure shape and the §155.4 jar-crust signature (ragged doubled crust on a smooth
    highlight shoulder) is absent.
  - Interior P5: **no REJECT condition present.**

---

# SCORING (GEOMETRY scoring agent, from the committed evidence only)

## srcAtArm stamps, stated plainly (three boots, one tree per boot)

| chunk | pid | boot window (Z) | committed tree | capture tree (all arms' srcAtArm) |
|---|---|---|---|---|
| 1 interior | 21207 | 05:39–05:45 | started `80cb86ad…`, drifted mid-boot (§165) | `520bd541…` — ONE stamp on all 5 arms |
| 2 courtyard (r3) | 2983 | 08:45–08:57 | `4bf8b093…` (revert verified, MATCHES COMMITTED true) | `0aaea246…` — ONE stamp on all 5 arms |
| 3 guard+night+hero | 9915 | 09:00–09:23 | `4bf8b093…` (revert verified, MATCHES COMMITTED true) | `0aaea246…` — ONE stamp on all 5 arms |

Chunk 1's committed tree moved under it mid-boot (the §165 coordinator revert): edit-time
stamp `7ba8ded8…`, per-arm stamps all `520bd541…` (= post-revert `152f2da9…` + the gold
edit — independently confirmed by r1's log, which edited `152f2da9…` into exactly
`520bd541…`). No stamp SPLIT inside any chunk, and chunk 1's three control arms are
sha256-identical (`6b3be800…`), so §165's adjudication stands: no contamination, chunk
STANDS. Between chunk 1 and chunks 2–3 the committed tree took `1ef6ec0` (Particles.js
revert) and `03a71c4` (capYaw); neither touches `Props.js` or world geometry, and every
registered comparison below is within-chunk, same-boot, same-stamp.

**The console 404** (one per boot, all three logs carry the identical line): adjudicated
via P1's within-boot identity. In each boot base==base2 (and ==restore where captured) is
bit-identical, so whatever resource failed to load, it failed identically for every arm of
the boot and had zero frame effect. It cannot differentiate arms and voids nothing.

## Courtyard scores (collateral guard; conventions per §122.1 stated inline)

- **P1 PASS** — base vs base2 **0 px** (threshold any-channel Δ>0); base, base2 AND restore
  are sha256-identical at ONE hash `d18abce0…`.
- **P2 PASS** — restore vs base **0 px** (same single hash).
- **P3 PASS** — hull vs base: 34,787 px (3.775 %, any-channel Δ>0), strong (Δ≥16) 6,913,
  maxΔ 187. Strong-diff clusters: x 58..356 and x 874..1111, y 23..403 — exactly the two
  colossi, whose gold-keyed trim (Statues.js crown/nemes bands, circlet, collar, pectoral,
  girdle, wrist bands) is the only `props_gold` geometry in frame. 69.0 % of changed px are
  Δ<8 (PostFX/bloom spill around the new lines, not surface repaints — same structure as
  interior). Verified zero changed px on: the obelisk (x 500..720 y 60..520: 0), the falcon
  statuette (x 390..470 y 330..420: 0), strict mid-sky between the colossi incl. wires and
  collectible rings (x 360..800 y 0..200: 0 — the instanced `coins` mesh is not part of
  merged `props_gold` and is correctly untouched), everything below y 430 (ground, paving,
  vessels, braziers: 0), and the lime vessel ROI x 940..1030 y 600..680 (0, both hull AND
  hull3x). **Canopic jars are interior-only objects** (Props.js:333–339); their zero-diff
  clause was scored on interior (0 px, both arms, `roidiff.mjs`) — the `lime` key is
  shell-less in every frame of this capture. Confined: **PASS**.
- **P4** — registered on the interior Ra disc; scored there (below). No Ra disc in
  courtyard.
- **P5 courtyard read** (1:1 + 4×, hull3x beside as calibrated known-bad, obelisk-085 crop
  as the sound-at-nearby-weight reference; crops committed under `crops/court-*`):
  - **hull3x reads as known-bad at every ROI** — crown circlet swallowed by a fat navy
    band, right colossus nemes bands crusted to navy, pectoral crescent grows a visibly
    DOUBLED dark under-band (the railroad signature, on demand). hull vs hull3x differ by
    52,063 px. The viewing condition scores (§141 satisfied).
  - hull, left colossus head (1:1 + 4×): gold trim gains one firmer contour that lands
    into the existing PostFX stroke — no second parallel line found at 4×.
  - hull, right colossus head + circlet: single clean closed contour on the circlet mount;
    no sticker edge — lines follow the trim shapes.
  - hull, pectoral crescent / girdle at grazing (court-rcolossus-wrist): thin single
    under-edge, no crawl, no doubling (contrast hull3x's doubled arc on the same crescent).
  - **Courtyard P5: no REJECT condition present.**

## Interior verification (scoring agent, from the committed crops and frames)

The capture agent's interior scores reproduce: control identity (`6b3be800…`), P3
confinement (diff mask shows changed px only on the Ra shrine cluster and the gilded
chest + treasure cluster; jars, Sly, walls, floor untouched), and the jar ROI 0 px (both
hull and hull3x). **P4 verified by eye at 4×**: in base the disc's upper rim melts into
the pale wall band; in hull a single continuous 2–3 px dark ring runs the full
circumference; legible at 1:1 as well (int-rastatue-*-1x). hull3x's ~7 px band swallows
the disc edge — the known-bad reads as known-bad. **P5 interior verified at both scales**:
treasure pile reads as individually-ringed coins at 1:1 (base: pale speckle) with closed
non-smeared loops at 4×; chest chunk reads ONE slightly heavier line; no sticker edge,
doubling, or crawl anywhere inspected. Interior P1–P5 stand as recorded above.

On the seal's named ROI "the gold hook rings": that phrase traces to the propshull
addendum's obelisk crop, whose hook ring is **architecture `gold_leaf` at hull 0.85** —
it is part of the reference standard, not a treated region (this change gates `props_gold`
only). The ring-class gold actually treated and inspected at both scales: the Ra collar's
concentric ring rows (`int-racollar-*`), the colossus crown circlet (court-rcolossus-head),
and the individual coin loops (int-treasure). All read as single clean closed contours in
`hull`; all crust or fuse in `hull3x`.

## Price sanity (counted column, arm-to-arm ONLY, never vs 250/1.2M — §153.1)

The registered +1 draw / +11,972 tris reproduced EXACTLY in all four framings that carry
the shell: interior 165→166 / +11,972; courtyard 280→281 / +11,972; guard 204→205 /
+11,972; night 280→281 / +11,972 (arms.json). Matches `hullgold-price.mjs`'s derivation
to the digit, 4/4.

## R1 — kerbline ride-along (guard/night, both arms; §152.3 language discipline)

Scanner self-test PASS (fires at lift +57.3 on the synthesized pass-2 artefact). Outputs:
`kerbline-r1.txt` / `kerbline-r1.json` (this directory; `.txt` not `.log` because the
root `*.log` ignore rule would silently exclude it from the sweep — the same trap the
.gitignore's own keeplog comment records, and why this directory's chunk logs are `.txt`).

- **The gold hull introduced nothing at those junctions**: guard-hull ≡ guard-base and
  night-hull ≡ night-base are sha256-identical (`86a93e02…` / `d51531e9…`). The shell IS
  drawn in both hull arms (+1 draw / +11,972 tris in the counted column, `live 1` with a
  clean 2.5/2.5 ink readback), and it changed zero pixels — every `props_gold` silhouette
  is off-frame or occluded in these two framings. The scanner's output is identical per
  pair (guard 82 runs / 82; night 224 / 224, same coords).
- **Detector-signature runs are present** — guard: 82 runs ≥12 px, clustered at
  y 23–32 / 85–87 / 128–131 x 738–867 and y 161–182 x 603–815; night: 224 runs, dominant
  band y 301–311 x 586–1140, secondary y 347–364 x 70–528, isolated y 529 x 416–428.
  Inspected at 3–4× (crops committed: `r1-guard-cluster-{top,mid,low}-4x`,
  `r1-night-cluster-{band,left}-3x`): every guard cluster is a thin pale-cyan rim
  highlight along masonry block edges inside the dark doorway opening or at the lit
  cornice edge — §155.5's backlit-gap/edge-lit class, re-generated on this tree (§155.5
  read 81 runs on the pre-rollback tree; 82 here); every night cluster is a moonlit
  top-arris highlight along the architrave/parapet edges and block-course joints.
- **The pass-2 kerb-contact signature was not located in the regions inspected.** (Stated
  in the registered language; NOT "not present in the frame" — the detector is width-blind
  by construction, §152.3.)

## R2 — kerbband2 ride-along (hero base; the §3.3 liveness gate)

Instrument calibration re-run this session before quoting: rim2 causal **1,691 EXACT**
(target 1,691 ± 2) with lift p50 **110.9 L** — the frozen definition reproduces the
committed record, so the count may be quoted.

- **Non-causal count on hero-base: n = 1,708** — 100.2 % of the 1,704 record, ≥ 850, the
  ≥ 50 % band.
- **4× ROI crop** (`r2-hero-kerbband-roi-4x.png`): a broad continuous pale-cyan bar runs
  the kerb's rounded top edge across the ROI — the picture and the count agree.
- **Registered outcome: the band is LIVE on this tree.** Referent C does NOT close. Per
  the seal, the moulding-radius arm gets **its own prereg**, which must contain (i) a
  retention condition on the intended key-catch arris line (§146.3's verified feature),
  (ii) a radius→0 hard-edge known-bad as its §13 calibration arm, (iii) the look-change
  declaration §17/§24.3 demand. Not sealed here; nothing in this capture pre-commits its
  thresholds.

---

# VERDICT

**ACCEPT.** By the registered ship rule (P1–P4 clean AND P5 clean):

- P1 **0 px** in every chunk (interior and courtyard control arms each sha256-identical).
- P2 **0 px** in every chunk (restore == base, bit-identical, both decisive shots).
- P3 confined to `props_gold` silhouettes on both decisive shots; **zero changed px on the
  canopic jars** (and on every other `lime` object inspected) — the lime key is shell-less,
  which is the exact geometry the §155.4 REJECT demanded removed.
- P4 the gilded Ra's sun disc **regains the clean continuous dark ring** §155.4 confirmed —
  same shell, same weight, verified against the committed crops, at 1:1 and 4×.
- P5 **none of the three REJECT conditions** (sticker edge / visible doubling against the
  PostFX line / grazing-angle crawl) on either decisive shot at 1:1 or 4×, with the
  hull3x calibration arm reading unmistakably heavy/doubled at every ROI (33,238 px from
  hull on interior, 52,063 px on courtyard) — the known-bad separates, so the condition
  scores and no §141 UNSCOREABLE outcome arises.

**Consequence: `HULL_KEYS = new Set(['gold'])` ships.** The coordinator applies the
one-line gold gate (`src/world/Props.js:135`) under its own ticket per §165's rule — the
scoring agent has made **no src edit**. Price at ship: +1 draw / +11,972 tris, reproduced
in all four framings; against the SCORED main-view citation (71 / 0.572 M, §153.1) that is
72 / 250 draws (28.8 %) and 0.584 M / 1.2 M (48.7 %). Task #28's lineage closes with the
narrow gate accepted: wide set REJECTED (§155.4), gold-only ACCEPTED (this file); the
§155.4 verdict comment at the site should be updated by the coordinator's sweep to point
here.

**Kerb referent C disposition (from R2): LIVE — stays open.** n = 1,708 (≥ 850 band) and
the 4× ROI crop shows the continuous cyan bar. The moulding-radius lever remains the one
open GEOMETRY kerb thread; it arms only via its own prereg with the three registered
requirements above. Referents A and B unchanged (SHADING's; §3.1/§3.2 of the seal).

R1 for the record: signature-class runs present at the coordinates listed above,
inspected and classified; **the pass-2 kerb-contact signature was not located in the
regions inspected**, and the gold hull introduced nothing at those junctions (hull arms
bit-identical to base in both ride-along framings).

## Files created/modified by the scoring pass (for the coordinator's sweep — no git run)

- Modified: `progress/records/hullkerb/RESULT-hullkerb.md` (this scoring + verdict).
- Created, `progress/records/hullkerb/`: `kerbline-r1.txt`, `kerbline-r1.json`.
- Created, `progress/records/hullkerb/crops/` (32 PNGs):
  `court-diffmask-{hull,hull3x}.png`;
  `court-lcolossus-head-{base,hull,hull3x}-{1x,4x}.png` (6);
  `court-rcolossus-head-{base,hull,hull3x}-{1x,4x}.png` (6);
  `court-lcolossus-lap-{base,hull,hull3x}-{1x,4x}.png` (6);
  `court-rcolossus-wrist-{base,hull,hull3x}-{1x,4x}.png` (6);
  `r1-guard-cluster-{top,mid,low}-4x.png` (3);
  `r1-night-cluster-{band,left}-3x.png` (2);
  `r2-hero-kerbband-roi-4x.png` (1).
- No `src/**` edits. No captures run. No lock tickets taken. Scratchpad-only helper
  scripts were not committed.
