# PREREG — fxshape2: D12's "floating rings/discs", attributed by suppression arms before anything is touched

Registered **before `shots/fxshape2/` exists on disk** and committed before the boot is queued.
This is the floater half of finishing D12 per RESULT-fxshape §5.1; the combat half (the
prescribed `fxshape.mjs` → `fxshapean.mjs` run, prior `cane_ring`) runs separately and is not
re-registered here. §141.1 applies from this commit forward.

## 0. The claim under test

Critic 10 sees dark floating rings/discs in 7+ shots: a ring above the `hero` ledge, a "black
ball … in mid-air above Sly's head" in `interior`, "three dark discs" in `guard`, "black
hook-rings in the sky" in `courtyard`, and a "ring-chain as disconnected ellipses" in
`traversal`. Critic 10's own routing guesses "likely D12's `cane_ring` family". **The registered
prior of record (RESULT-fxshape §5.1) is `cane_ring`** — that stays the prior this run exists to
test, and it is falsifiable here by one arm.

## 1. The lock-free evidence gathered BEFORE this seal (motivation, not gates)

All of it arithmetic + raycast against the committed tree at `eb95d04`; no capture was taken.

- `tools/pixat.mjs` (headless raycast through the shot cameras) hits **`coins`** — the Props
  collectible InstancedMesh — at courtyard (530,75) and (790,100) (world (−2.67, 9.92, 30.02),
  (1.99, 9.89, 30.02): the architrave-ledge trail seen against sky) and at guard (490,635),
  (1080,445) (scattered coins at y 0.66–0.84).
- In the live boot `Pickups._author()` **hides that Props mesh and draws its own
  `pickup_coins`** at the same adopted spots PLUS `authorRouteCoins()` trails strung every
  2.6 m along `A.api.route` at `lift 0.85`. Projecting the route-coin arithmetic through the
  shot cameras (scratchpad `project.mjs`, jitter ±0.22 m ≈ ±10–20 px):
  - `traversal`: the `hook-chain → hall-front-cornice` leg puts coins at px (411,64), (437,122),
    (452,156), (461,177), (468,193), (473,204), (477,213) — a five-plus-point match to the
    observed "ring-chain" blob line at (427,66), (443,113), (449,158), (459,175).
  - `interior`: the `vault-floor → sarcophagus` leg puts coins at (636,393) — the observed
    "black ball above Sly's head" at (632,387) — and (347,578), the observed floor-left disc at
    ~(334,578).
  - `hero`: `kiosk-lintel → hook-chain #1` lands at (772,22) = the observed top blob (770,20).
  - The hero ledge ring at (631,271) matches **`treasure_scarab`** at (2.2, 9.35, 8.4):
    projected (632,285) at bob-bottom, (632,273) at bob-top (`treasureBob` 0.16 = ±12 px at
    11.1 m).
- The sky-bird arithmetic (Sky.js `_buildBirds`, seeded) puts no bird inside any of these
  frames' floater regions; birds do land in `night`/`temple`/`dunes` — that family is the
  critic's separate "lens-ghost floaters" item, routed to LIGHTING/POSTFX, out of scope here.

**So the pre-capture prior, stated to be falsifiable: the floaters are `pickup_coins` instances
and `treasure_*` meshes (src/world/Pickups.js) rendering dark, and `cane_ring` — the registered
§5.1 prior — draws none of them.** The suppression arms decide; the projections above motivate
ROIs and nothing else.

## 2. Instrument

`progress/records/fxshape2.mjs` (one boot, one tree, every arm page-side) scored by
`progress/records/fxshape2an.mjs`. A pixel counts as changed at `|dR|+|dG|+|dB| >= 4` (fx5an's
threshold, §122). Luminance is Rec.709 on sRGB bytes; saturation is HSV S.

Shots under test: `hero`, `interior`, `courtyard`, `traversal`, `guard`.

**Registered ROIs** (centre x, centre y, half-side, all in 1280×720 px, from the r10 frames):

| id | shot | roi | observed as |
|---|---|---|---|
| T1 | traversal | (427,66) ±16 | ring-chain blob 1 |
| T2 | traversal | (443,113) ±16 | ring-chain blob 2 |
| T3 | traversal | (449,158) ±12 | ring-chain blob 3 |
| T4 | traversal | (459,175) ±11 | ring-chain blob 4 |
| H1 | hero | (631,271) ±22 | ring above the ledge |
| H2 | hero | (770,20) ±14 | top-edge disc |
| I1 | interior | (632,387) ±14 | black ball above Sly's head |
| I2 | interior | (334,578) ±16 | floor-left disc |
| C1 | courtyard | (532,76) ±14 | sky ring 1 |
| C2 | courtyard | (790,100) ±14 | sky ring 2 |
| G1 | guard | (490,635) ±18 | dark disc 1 |
| G2 | guard | (1080,445) ±16 | dark disc 2 |

ROI centres are the r10 observations, not the projections, so a placement drift between r10's
tree and this boot's shows up as a SUBJECT-PRESENT failure rather than as a silent re-aim.

## 3. Arms, in capture order, all in ONE invocation

| arm | what changes (page-side only, no source arm) |
|---|---|
| `base` | nothing |
| `nocoins` | `pickups._coinMesh` detached from its parent |
| `notreasure` | every `treasure_*` mesh detached (Pickups.update re-asserts `.visible` per frame — the trails trap — so detach, not hide) |
| `noringfx` | the `ring` particle batch mesh detached (`cane_ring`/`land_ring`/`dive_ring`/`dust_ring` all render through it) — **this is the arm that tests the registered prior** |
| `nopickups` | the whole `pickups` root detached (union: coins + treasures) |
| `base2` | everything re-attached — VALIDITY + restore check |

Uniform background condition, applied identically in EVERY arm including both bases:
`coin_sparkle` and `coin_pop` are blocked at `_emit`. They spawn through the module-level rng
sequence, which is not re-seeded per arm, and they spawn AT the coins — exactly the ROI pixels —
so leaving them live would put arm-to-arm rng jitter on the pixels under test. Blocking them
uniformly subtracts the same thing from every arm and never enters any diff.

Clock discipline (§275.1): `engine.time = 0` before every `setShot`, then `{ dt: 1/60 }` — every
arm renders every shot at the same absolute timeline (0.283 s), so coin bob/spin phase, treasure
bob, guards, flames and gusts are identical across arms.

## 4. VOID guards, read in §5.1's order, stop at the first that trips

1. **SUBJECT PRESENT** — two levels, both fail-closed:
   - run-level: the `nopickups` arm must change **> 0 px inside the union of all ROIs**, or
     nothing under test was drawn and the run is VOID (§275.1 rule 3's shape).
   - per-ROI: in `base`, the ROI core's mean L must be **≥ 0.03 below** the mean L of its
     surrounding annulus (the box grown 2.2×, minus the core). A floater is a dark blob; a ROI
     that is not darker than its surround does not contain its subject this boot (collected,
     occluded, or moved) and is individually VOID.
2. **VALIDITY** — per shot, `base` vs `base2` under **200 changed px**. Registered fallback,
   tiered and decided now, not after looking: if a shot's frame-wide check fails, its ROIs stay
   individually admissible — labelled **DEGRADED** — iff that ROI's own base/base2 delta is
   under `max(8 px, 12% of the ROI's area)`; otherwise the ROI is VOID.
3. **PROVENANCE** — sha and `src/` dirtiness are sampled inside `onLocked` (fxdraw's seam, not
   fxshape's process-start defect). The scorer refuses any ship-shaped conclusion if the
   manifest is missing provenance, `src/` was dirty at capture, or the sha differs from the tree
   it is scored against. Attribution remains readable on the one-boot argument.

## 5. Attribution rule (registered before any frame exists)

For each admissible ROI: `removed(arm)` = changed px inside the ROI between `base` and that arm,
for `nocoins`, `notreasure`, `noringfx`, and the union `nopickups`.

- The ROI's owner is the single arm with the largest `removed`, **iff** that maximum is
  **≥ 30 px** and **≥ 60% of the largest of the four counts**. `noringfx` winning any ROI
  confirms the §5.1 prior there; `nocoins`/`notreasure` winning falsifies it there.
- Anything else — no arm reaches the bar, or the union itself is < 30 px while the darkness
  predicate passed — is **UNATTRIBUTED, stated as such**, never rounded to the nearest suspect.

The run makes **no ship claim and moves no parameter**. Its output is an attribution table.

## 6. Ride-along evidence (not gates)

- In the same boot, on the `base` arm, a page-side `THREE.Raycaster` is cast through every ROI
  centre against `engine.scene` and the first three hits are recorded in the manifest. This is
  the live-scene version of the pixat probe (which cannot see Pickups: `tools/lvl.mjs` builds
  Architecture + Props only) and it names meshes directly.
- One `combat` frame on the shipped tree, nothing scored from it: visual context for the
  separately-run fxshape combat attribution.

## 7. Falsifiers

- If `noringfx` owns any floater ROI, the §1 prior ("the floaters are pickups") is wrong there
  and the §5.1 prior (`cane_ring` family) survives — that is a finding, not a failure.
- If the ray-cast names a mesh family none of the arms toggles (guards, KayKit, statues,
  water…), the arm set was mis-designed; the run reports UNATTRIBUTED for those ROIs and the
  next arm set is a new pre-registration, not a quiet re-score of this one.
- If `nopickups` removes the blobs but neither `nocoins` nor `notreasure` reaches 60% on some
  ROI, the union/parts decomposition is leaking (shared parent, shadow, or outline coupling) —
  reported as UNATTRIBUTED-WITH-UNION, and the mechanism gets its own investigation.

## 8. Out of scope, deliberately

- The `combat` donut ring: that is the §5.1 prescription (`fxshape.mjs` → `fxshapean.mjs`,
  prior `cane_ring`, fix via `fxdraw.mjs` under PREREG-fxdraw's gates). Separate boots, separate
  records; nothing here gates it.
- The `night`/`temple`/`kaykit`/`sly-profile` "lens-ghost floaters" — critic 10 routes them to
  LIGHTING/POSTFX; the bird arithmetic in §1 is recorded for whoever picks that up.
- WHY gold coins render dark (material/lighting mechanism) — that is the fix-side question and
  it belongs to the owning module once attribution names it. Nothing in `ringPainter` may be
  touched under any outcome (RESULT-fxshape §5.1: `land_ring`/`dive_ring`/`dust_ring` share the
  tile).
