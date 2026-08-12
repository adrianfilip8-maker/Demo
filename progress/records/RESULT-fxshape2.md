# RESULT — fxshape2: D12's "floating rings/discs" are the PICKUPS, not the FX; the combat donut is NOT one dominant emitter; and the combat duplicate-arm bar is unachievable on this box

Status: **the floater attribution is made and triple-instrumented (evidence-grade; the sealed
arm run is queued and PREREG-fxshape2 §141.1 stands); the cane_ring candidate is scored VOID
and its parent claim is withdrawn by the PREREG's own falsifier; no src/ ships.** Three capture
windows were spent tonight; each returned a named structural finding rather than the number it
was sent for, and the findings are worth more than the number would have been. `ringPainter`
untouched under every branch, per the absolute constraint.

---

## 1. The floaters: named object by object, three independent lock-free instruments agreeing

Registered as the prior in PREREG-fxshape2 §1 (committed `8065e47` BEFORE any boot) and
therefore falsifiable by the queued arms; stated here with the instruments that produced it:

| critic-10 sighting | pixel (r10) | what it is | instrument |
|---|---|---|---|
| courtyard "black hook-rings in the sky" | (530,75), (790,100) | **coins** — the architrave-ledge trail at world (−2.67, 9.92, 30.02) / (1.99, 9.89, 30.02), z 30, against sky | pixat raycast (exact hit, instanced `coins`) |
| guard "three dark discs" | (490,635), (1080,445) | **coins** at y 0.66–0.84, 3.7–6.6 m from the night camera | pixat raycast (exact hit) |
| traversal "ring-chain as disconnected ellipses" | (427,66)…(459,175) | **route-trail coins**, the `hook-chain → hall-front-cornice` leg — strung every 2.6 m at lift 0.85, y 14.6–15.5, across open sky | `authorRouteCoins` arithmetic: projects to (411,64), (437,122), (452,156), (461,177) — a four-point line match within the ±0.22 m authored jitter |
| interior "black ball above Sly's head" | (632,387) | **route-trail coin**, `vault-floor → sarcophagus #4` — projects to (636,393), 9.8 m out | same arithmetic; its trail-mate #2 projects to (347,578) = the observed floor-left disc |
| hero "ring above the ledge" | (631,271) | **`treasure_scarab`** at (2.2, 9.35, 8.4) — projects to (632,285) at bob-bottom, (632,273) at bob-top (`treasureBob` 0.16 ≡ ±12 px at 11.1 m) | treasure projection |
| hero top-edge disc | (770,20) | route-trail coin `kiosk-lintel → hook-chain #1` → (772,22) | same arithmetic |

In the live boot every one of these is a `src/world/Pickups.js` mesh: `pickup_coins` (route
trail + the 44 adopted Props spots — Pickups hides Props' decorative twin at author time) and
`treasure_*`. The first fxshape2 boot's lever inventory confirmed the live scene:
`pickup_coins x81 · treasures [treasure_scarab, treasure_collar, treasure_ingot] · Props deco
coins hidden: true`.

**Critic 10's routing guess — "likely D12's `cane_ring` family" — pointed at the wrong module
for every floater the round named.** `tools/pixat.mjs` cannot see any of this (its headless
builder is Architecture + Props only; Pickups, birds, guards and fx meshes are invisible to
it), which is exactly how "raycasts to nothing" got misread as "must be FX". The registered
`cane_ring` prior is **falsified for the floaters** on this evidence; the sealed suppression
run (six arms × five shots, `noringfx` arm carrying the prior) is queued behind tonight's FIFO
backlog and scores it gate-grade when it lands — PREREG-fxshape2's ROIs, guards and 60%/30 px
attribution rule are already committed and cannot move.

Also recorded for the separate "lens-ghost floaters" item (LIGHTING/POSTFX per critic 10's own
routing): the **sky birds** land at (912,263)/(1020,218)/(1104,232)/(1070,221) in `temple` and
(250,31)/(356,17)/(419,61)/(395,41) in `night` by seeded-orbit arithmetic — dark-ink V-sprites
25–45 px across at those cameras. No bird projects into any D12 floater frame.

### Why gold pickups read as BLACK rings/discs (mechanism, routed — not this lane's fix)

`Pickups._mat('gold')` is toon `metal: 0.85, gloss 96` mirroring Props' gold. §264 measured
the missing specular normalisation this family leans on; §267 records the cane's gold blocked
on it. A 0.32 m coin at 4–14 m is a handful of texels of dark metal plus the ink-outline pass
wrapped around a small silhouette — backlit against the twilight sky (courtyard, traversal,
tod 0.76–0.77) or at night (guard) it reads as a black annulus. Placement amplifies it: the
ledge trail is authored to be seen against sky, and the route trail's hook-chain leg hangs
eight coins across open sky. OWNERS: PICKUPS (coin/treasure read — §2.1 says collectibles
"must pop against sandstone"; today the sparkle is white — critic 10 routed that to FX
separately — and the coin body is black, so both halves of "reads as loot" are broken from two
different modules), with SHADING's §264 normalisation upstream.

## 2. The combat donut: the §5.1 procedure was run, and what it returned is two instrument findings and a withdrawn claim

### 2a. fxshape run 3 — VOID at VALIDITY; the cross-lane tree flip is real and measured

Run 3 (tree `8065e47`) passed SUBJECT PRESENT (`nocane` removes 817,704 px) then tripped
VALIDITY (`base` vs `base2` = 780,628 px). Two mechanisms, both now measured:

- **One locked boot is NOT one tree.** The LIGHTING lane's `f4056f4` (torchlight term,
  18:59:16) landed in the shared working tree between the `noring` (18:57) and `noflash`
  (19:00) arms. `noflash` came back **+0.097 mean L brighter than base over the brazier
  pools** — removing an ADDITIVE sprite cannot brighten anything through a per-pixel-monotone
  pipeline (the spark batch is `THREE.AdditiveBlending`), and the right third of the frame is
  bit-stable, so that delta is the arriving local-light term, not the flash. `SANDS_NO_HMR`
  (hmr off, watcher ignored) did not keep it out. Both attribution runners now stamp
  `{sha, srcTree, dirty}` per capture and both scorers VOID across any stamp change
  (`eeccb0a`); the "same-tree by construction because one boot" rider is withdrawn everywhere
  it was printed.
- What survives run 3 as evidence (pre-flip same-tree pair, no valid duplicate): `base`/`noring`
  put the ring's own contribution at **184,126 px (20% of frame), meanLift +0.0985, peak
  0.588, meanSat 0.207, median 10–90 edge rise 80 px**, covering **57.7% of the D4 hero box at
  +0.0536 mean L**. That is the r10 donut, and it is ring-shaped because `cane_ring` reaches
  1.55 m half-extent at capture age with col0 still on near-white `PAL.goldSpec`.

### 2b. fxdraw — six arms, one tree BY MEASUREMENT, and a verdict that blocks the ship three ways

`node progress/records/fxdraw.mjs cane_ring '{"size":[0.22,1.35],"col0":15241514}'` under
PREREG-fxdraw + both addenda; scored by `fxdrawan.mjs` the moment the manifest landed:

```
VALIDITY  base vs base2: 793,969 changed px — VOID
SUBJECT   suspect footprint F0 = 191,278 px — OK
PROVENANCE VOID: captured a1ca2542 (onLocked), scored against 30a02bd2
TREE      6 stamps — ALL IDENTICAL (30a02bd2, src 1912cb53)
D1 SHRINK       FAIL   F1 118,365 > 0.40*F0 76,511
D3 NOT-DELETED  PASS   F1 118,365 >= 0.25*F0 47,820
D2a CHROMA      FAIL   candSat 0.314 < 0.35
D2b SAME-RUN    FAIL   candSat 0.314 < 2.5*suspectSat (0.527)
D4 HERO         PASS   candLift 0.0045 <= 0.40*suspectLift (0.0210)
FALSIFIER-1     suspect F0 191,278 = 36.5% of nocane 523,975 — UNDER 50%: WITHDRAWN
VERDICT: VOID — nothing ships from this run, PASS or not.
```

Read in order of importance:

1. **Falsifier 1 fired.** Even at face value the ring is ~36.5% of everything the impact draws
   — PREREG-fxdraw §5's own clause withdraws the "one dominant emitter" claim rather than
   re-scoping it. The donut is the ring; the SMEAR/veil is the ring + flash + sparks + their
   bloom together. A cane_ring-only candidate was never going to be the whole fix, and the
   pre-registration said so itself before any candidate existed.
2. **The per-arm stamps did exactly their job, in both directions**: they prove all six arms
   shared one tree (`30a02bd2` — which also shows the onLocked provenance snapshot goes stale
   before vite even spawns; the stamps, not the snapshot, are the same-tree evidence), and
   with the tree ruled out they isolate the remaining validity failure as something else —
   see 2c.
3. The gate numbers are direction-only under a validity VOID (the drift floor below sits
   inside F0/F1/candSat), and are recorded as such, not as measurements.

### 2c. The finding above both runs: the combat duplicate-arm bar is UNACHIEVABLE on this box, and §275.1's diagnosis of run 2 was incomplete

Three same-boot `base` vs `base2` pairs on `combat` now exist, under three different clock
disciplines, and they are the same number:

| run | clock discipline | base↔base2 | signature |
|---|---|---|---|
| fxshape run 2 | dt 1/60, no rewind | 751,902 px | attributed (§275.1) to ambient phase |
| fxshape run 3 | dt 1/60 + rewind | 780,628 px | mean d 11.3, flats 92.9% changed, global L −0.0069 |
| fxdraw | dt 1/60 + rewind, stamps identical | 793,969 px | mean d 11.8, d≥30 only 3.8%, global L −0.0060 |

Same-tree, same absolute world clock (every arm t = 0.2833), and the frame still drifts: a
**slow global luminance sag of ~−0.006 L across ~17 minutes of captures**, low-amplitude
(mean |d| ≈ 11–12 RGB-sum, ≈ 4 per channel), covering ~60–86% of pixels INCLUDING flats. So:

- **run 2's 751,902 px was never (only) the missing rewind** — the rewind is implemented and
  the number did not move. §275.1's rule stands (fixed dt + rewind is still necessary), but it
  is not sufficient on `combat`, and the ledger should stop citing run 2 as proof that the
  rewind fixes the duplicate arm.
- The <200 px validity bar has now been missed by ~4,000x on three consecutive combat runs.
  Until the sag's mechanism is found (candidates worth testing cheaply, in one boot, by
  whoever takes this: wall-clock-coupled state in the renderer/compositor rather than
  world-clock — the world clock is rewound and stamped identical, so the driver is something
  that integrates REAL time or CAPTURE COUNT; the arm-to-arm deltas in run 3 were 79k–190k
  versus 780k end-to-end, so it accumulates roughly monotonically), **no combat A/B on this
  box can pass a frame-wide duplicate check, and any that appears to should be distrusted.**
- The floater run (fxshape2, queued) reads its shots through PREREG-fxshape2 §4.2's
  registered per-ROI fallback, so it degrades instead of dying if its shots carry a milder
  version of the same sag; whether they do is itself useful data and lands with that run.

## 3. What ships from this task

**No `src/**` change.** The registered gates say the candidate does not ship; the falsifier
says the claim it implemented is too narrow; fail-closed means exactly this. What does ship:

- The floater attribution (§1) with named owners (PICKUPS / SHADING §264; birds → the
  LIGHTING/POSTFX ghost item), critic-10's D12 routing corrected.
- PREREG-fxshape2 + runner + scorer + shared ROI module, sealed, with the run queued.
- Per-capture tree stamps in `fxshape.mjs` / `fxshape2.mjs` / `fxdraw.mjs` and stamp guards in
  all three scorers (`eeccb0a`, `49064da`) — the one-boot rider withdrawn.
- ADDENDUM2-fxdraw (stamps + the `nocane` falsifier arm) and `fxdrawan.mjs`, the previously
  missing PREREG-fxdraw scorer.
- The `fxdraw.mjs` §275.1 rewind amendment (it would have VOIDed on its own base2 exactly like
  run 2 without it — and now we know it VOIDs anyway, for the deeper reason in §2c).
- KNOWN_ISSUES §296 with all three findings.

## 4. What is deliberately NOT claimed

- Which single emitter "is" the combat smear — the falsifier withdrew that framing; the next
  candidate must treat the impact family (ring size/colour + flash + spark gains) as one
  composition, under gates that can actually validate (which needs §2c solved first).
- That the floaters are gate-grade attributed — that lands with the queued sealed run; §1 is
  three instruments of lock-free evidence plus a live-scene inventory, labelled exactly that.
- Anything about `ringPainter`, `land_ring`, `dive_ring`, `dust_ring` — untouched, and the
  PLANAR/size-clamp exemption untouched with them.
- The 2 pre-existing `bundle:` test failures (sly-cane staging, from `5ecc80b`'s cane swap)
  are the cane lane's and are not addressed here; the suite otherwise passes 466/468 exactly
  as inherited.
