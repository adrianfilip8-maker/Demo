# PREREG — coinlit: the strung coins and the "string-light lamp discs" are unlit gold, and the A/B is a same-boot poke

**Seal (b) of the PROPS lane's three.** Registered BEFORE any arm runs. §141.1: no threshold
below moves afterwards.

## 1. The complaint and the objects, named by arithmetic before any capture

Critic r12, verbatim: *"the strung pickup coins upper-left render near-black, unlit ovals"* and
*"dark ellipses floating in the sky (the string-light lamp discs rendering unlit, edge-on — they
read as UFOs/dirt)"*.

**Two object families, both identified from committed constants and confirmed by raycast — no
capture was spent on the attribution** (§296's "projection arithmetic is the free instrument"):

| family | what it is | courtyard pixels (projected) | confirmation |
|---|---|---|---|
| **COINS** | `Pickups` `pickup_coins`, the architrave-ledge trail authored at `Props._collectibles` `[-21 + i*4.6, 9.9, 30]` — ten coins strung in a line against open sky | (245,51) (534,77) (790,100) (1019,121) (1225,139), 12-17 px | `tools/pixat.mjs courtyard 528,73 790,95` -> `coins` at (-2.70, 9.95, 30.02) / (1.99, 9.98, 30.02) |
| **RINGS** | `EgyptLevel.courtyardTraversal`'s eleven `Kit.hookRing` instances, `A.instance('gold_leaf', ringGeo, mats, 'hooks:rings')`, hung from the two hook cables at y 11.6-14.9 | (1006,123) (780,188) (658,229) (589,263) (513,285) (442,302) (261,171) (446,223) (557,254), 15-34 px | 10x crop of `shots/r12/courtyard.png` at (750,160)+70x60: a grey-blue annulus with sky through the hole, a chain above and the magnetism sparkle below — the "UFO" |

**CALIBRATION, disclosed:** the projections above are computed from the authored world
coordinates through `SHOTS.courtyard` (pos [-2.5,4,41.5], target [1.5,6.4,16], fov 55) at
1280x720. They reproduce §296's independently-recorded coin sightings at (530,75) and (790,100)
to within 4 px, and they land on the discs visible in the r12 frame. At scoring time the ROIs are
NOT these hard-coded numbers — they are re-derived per shot from the LIVE instance matrices of
`pickup_coins` and `hooks:rings` inside the same boot, so the ROI follows the object rather than
a number typed from a picture.

## 2. Mechanism (§296, already attributed — restated as the thing the arms test)

`Pickups._mat('gold')` and Architecture's `gold_leaf` are both toon **metal 0.85**, and
`toon.glsl.js:837` is `diff *= mix( 1.0, 0.20, slyMetal )` — its own comment says this "removes
68% of gold's own colour at metal 0.85". What is meant to replace it is the specular lobe, which
`uSpecNormPow 0.0` leaves un-normalised (§264/§267, SHADING's item, NOT this seal's), and
`metalEnv`, which for a face-on disc runs `ef = mix(0.25, 1.0, pow(1-ndv,3)) -> 0.25` and returns
`alb * env * (0.85 * 0.62 * 0.25) = 0.13 * alb * env` of a grey-blue sky. So a small gold object
loses 68% of its albedo and gets 13% of the sky back: grey hardware, wrapped in a PostFX ink line
that is a large fraction of a 12-30 px silhouette.

Two levers, both inside this lane, neither touching the shared shader, the shared gold material,
or the bloom path:

* **M (metal)** — give the coin mesh and the ring mesh their OWN toon material at **metal 0.30**
  (diffuse retains 0.79 of the gold albedo instead of 0.32). `_mat('gold')` and `gold_leaf` are
  untouched, so the treasures and every gilded architecture surface are byte-identical by
  construction, not by tuning.
* **N (normals)** — `PropKit.coin` is a 12-gon cylinder whose two caps are FLAT, so the whole
  visible face of a coin lands in ONE toon band from every angle. Spherify the cap normals
  (`N = normalize(mix(flat, radial-from-centre, dome))`, dome 0.75): the face then carries a
  terminator, so some part of it is lit for any key direction. Positions and indices are
  untouched — **zero triangle delta**.

## 3. Instrument: ONE BOOT, NO INSTALL, per-shot poke arms (§302)

Nothing is written to `src/**` by this run. Both levers are runtime-reversible:

* **M** assigns `shading.toon({...recipe, metal: 0.30})` — a *different* cache key, therefore a
  *new* material object — to `pickup_coins` and to `hooks:rings` only. The back arm reassigns the
  captured original material references. No other mesh can be reached.
* **N** rewrites `geometry.attributes.normal` in place, having first copied the original
  `Float32Array`. The back arm writes the copy back.

Arms per shot, restore-first (the fxartifact/gradetrio ARM shape — every arm assigns BOTH levers,
so poke and restore are one code path):

```
off   metal base   normals base      <- the A of every pair
mon   metal 0.30   normals base
non   metal base   normals dome
both  metal 0.30   normals dome
back  metal base   normals base      <- diff(off, back) is the validity block
```

`{dt:0}`, `step(2,0)`, `renderFrame(0)` per arm; per-capture `{sha, srcTree, dirty}` stamps
(§296 finding 2); the scorer VOIDs on any stamp change.

## 4. STAGINGS — a registered RULE, not a chosen list

A shot is a **qualifying staging** for a family if, at capture time, that family projects >= 3
instances whose apparent diameter is >= 10 px and whose ROI box lies wholly inside
[16,1264] x [8,712]. ROI = a box of half-size `max(5, 0.55 * apparentPx)` about each projected
centre; the family's ROI for a shot is the union.

Offline the rule currently selects: **RINGS** — courtyard (9), night (7), dunes (11), hero (4),
traversal (3); **COINS** — courtyard (5), dunes (10, but at 4-5 px they will not qualify).
The scorer applies the rule to the live projections and takes whatever it selects. **The bar must
hold at EVERY qualifying staging** (no cherry-picking), and the seal scores only if each family
has **>= 2** qualifying stagings. If COINS ends with < 2, the coin half does not ship and the ring
half is scored alone — registered here so that outcome is a branch and not a rescue.

## 5. Bars

Luma is Rec.601 on sRGB bytes (0-255); saturation is HSV S on the same bytes.

| id | bar | ship requires |
|---|---|---|
| **B1 LUMA** | ROI-union mean L, ship arm vs `off`, per family per qualifying staging | **>= +10.0** everywhere |
| **B2 CHROMA** | ROI-union mean S, ship arm vs `off` | **>= +0.04** everywhere (gold must read as gold, not as brighter grey) |
| **B3 SPEC PRESENCE** | `hiFrac` = fraction of ROI px with L >= (ROI mean L + 25), ship arm | **>= 0.05** and **> the `off` value** everywhere |
| **P1 VALIDITY** | per-shot `diff(off, back)` changed px, same boot | **== 0** on every captured shot (§302: same-boot only; no cross-boot [0,0] is claimed anywhere) |
| **P2 TREASURE HOLD** | live `treasure_*` ROIs, mean L, ship arm vs `off` | **abs(dL) <= 1.0** — the r12 gold treasure read is protected |
| **P3 NO BLOOM RE-FEED** | frame MINUS every coin/ring/treasure ROI: mean L, and the count of px with L >= 250 | **abs(dmeanL) <= 0.15** and **d(px>=250) <= 0.20% of frame** |
| **P4 GATE INTACT** | the shipped character-bloom gate's own pin test | still green in the suite at ship |

**Ship arm** is `both` if it passes; if `both` fails only because one lever is inert, the
registered fallbacks are `mon` (metal alone) and then `non` (normals alone), scored against the
identical bars. If none passes, **nothing ships** (fail-closed).

## 6. SCORING RECIPE

```bash
git push -u origin claude/sly-cooper-ancient-egypt-0koo0u      # records pushed BEFORE launching
bash tools/launch.sh progress/records/props1/props1.mjs \
     /home/user/Demo/progress/records/logs/props1-run1.log /tmp/sands-of-ra/props1-run1.pid
# "launch OK ... ppid 1" is the only success line.
node progress/records/props1/coinlit-score.mjs            # reads progress/records/props1run1/manifest.json
```

* **PASS** -> ship-write is exactly three edits and nothing else:
  * `src/world/PropKit.js` — `coin(r, t, { dome = 0.75 })`, normals only.
  * `src/world/Pickups.js` — a `_mat('coin')` variant at metal 0.30 used ONLY by `_coinMesh`;
    `_mat('gold')` untouched, so treasures keep their material.
  * `src/world/Architecture.js` — a `gold_ring` MATS row (`metalAmount: 0.30`, the field the
    resolver already supports at `metal: r.metal ? (r.metalAmount ?? 0.85) : 0`), added to
    `HULL_OUTLINE` for parity with `gold_leaf`, and `courtyardTraversal`'s one `A.instance` call
    switched to it. Draw-call neutral: `hooks:rings` is already its own InstancedMesh.
  * plus `tests/coinlit.test.mjs` pinning the three values and the treasure/architecture
    materials' metal at 0.85.
* **FAIL / VOID** -> `src/**` unchanged, RESULT-coinlit records the miss.
