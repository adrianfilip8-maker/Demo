# RESULT — hullkerb: the gold-only prop hull (PREREG-hullkerb.md, sealed at 418bb93)

**STATUS: CAPTURE IN PROGRESS — nothing below is a verdict until this line says SCORED.**

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
- [ ] chunk 2: courtyard — **r1 (pid 25140) killed by the §167 rollback before its first
      frame** (`log-chunk2.txt` preserved as that record); **r2 relaunched 08:1xZ pid 11456**,
      log `log-chunk2-r2.txt`. Tree note (per seal P1/P2 wording, WITHIN-chunk comparisons):
      the committed tree has moved since chunk 1 — Particles.js revert (`1ef6ec0`) and the
      §166 capYaw ship in SlyModel.js (`03a71c4`) — so r2's srcAtArm stamps will differ from
      chunk 1's `520bd541…`. Neither touches Props.js or world geometry; cross-chunk stamp
      drift does not void P1/P2, and the stamps are stated plainly below when scored.
- [ ] chunk 3: guard + night + hero

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

## Verdict

NOT YET SCORED — courtyard (collateral guard) + ride-alongs outstanding.
